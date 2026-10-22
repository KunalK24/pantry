import { lookup } from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP } from 'node:net'

const MAX_HTML_BYTES = 1024 * 1024
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 12_000
const BLOCKED_PAGE = /(?:captcha|verify you are human|access denied|enable javascript and cookies|attention required!|checking your browser|cloudflare ray id)/i

export type RecipeUrlAcquisitionErrorCode = 'unsafe_url' | 'access_denied' | 'invalid_source' | 'timeout' | 'fetch_failed' | 'too_large'

export class RecipeUrlAcquisitionError extends Error {
    constructor(public readonly code: RecipeUrlAcquisitionErrorCode, options?: ErrorOptions) {
        super(code, options)
        this.name = 'RecipeUrlAcquisitionError'
    }
}

const blocked = new BlockList()
for (const [subnet, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
    ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
    ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(subnet, prefix, 'ipv4')

const ipv6Blocked = new BlockList()
ipv6Blocked.addSubnet('2001:db8::', 32, 'ipv6')
ipv6Blocked.addSubnet('2001::', 32, 'ipv6')
ipv6Blocked.addSubnet('2001:10::', 28, 'ipv6')
ipv6Blocked.addSubnet('2002::', 16, 'ipv6')

function safeAddress(address: string): boolean {
    const family = isIP(address)
    if (family === 4) return !blocked.check(address, 'ipv4')
    if (family === 6) {
        const normalized = address.toLowerCase()
        // A conservative IPv6 allowlist excludes local, mapped, documentation and special ranges.
        if (!/^[23][0-9a-f]*:/i.test(normalized)) return false
        return !ipv6Blocked.check(address, 'ipv6')
    }
    return false
}

function validateUrl(raw: string): URL {
    let url: URL
    try { url = new URL(raw) }
    catch { throw new RecipeUrlAcquisitionError('unsafe_url') }
    if (raw.length > 2048 || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) {
        throw new RecipeUrlAcquisitionError('unsafe_url')
    }
    url.hash = ''
    const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || !hostname.includes('.') && !isIP(hostname)) {
        throw new RecipeUrlAcquisitionError('unsafe_url')
    }
    return url
}

async function pinAddress(url: URL): Promise<{ address: string; family: 4 | 6 }> {
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    const literal = isIP(hostname)
    if (literal) {
        if (!safeAddress(hostname)) throw new RecipeUrlAcquisitionError('unsafe_url')
        return { address: hostname, family: literal as 4 | 6 }
    }
    let addresses: { address: string; family: number }[]
    try { addresses = await lookup(hostname, { all: true, verbatim: true }) }
    catch (error) { throw new RecipeUrlAcquisitionError('fetch_failed', { cause: error }) }
    if (!addresses.length || addresses.some(({ address }) => !safeAddress(address))) throw new RecipeUrlAcquisitionError('unsafe_url')
    return { address: addresses[0].address, family: addresses[0].family as 4 | 6 }
}

async function requestPage(url: URL, signal: AbortSignal): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    const pinned = await new Promise<{ address: string; family: 4 | 6 }>((resolve, reject) => {
        const onAbort = () => reject(new RecipeUrlAcquisitionError('timeout', { cause: signal.reason }))
        if (signal.aborted) return onAbort()
        signal.addEventListener('abort', onAbort, { once: true })
        pinAddress(url).then(
            (address) => { signal.removeEventListener('abort', onAbort); resolve(address) },
            (error) => { signal.removeEventListener('abort', onAbort); reject(error) },
        )
    })
    if (signal.aborted) throw new RecipeUrlAcquisitionError('timeout', { cause: signal.reason })
    const transport = url.protocol === 'https:' ? https : http
    return await new Promise((resolve, reject) => {
        let settled = false
        const finish = (error?: Error, result?: { status: number; headers: http.IncomingHttpHeaders; body: string }) => {
            if (settled) return
            settled = true
            signal.removeEventListener('abort', onAbort)
            if (error) reject(error)
            else if (result) resolve(result)
        }
        const request = transport.request(url, {
            agent: false,
            lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
            headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity', 'User-Agent': 'PantryRecipeImporter/1.0' },
            timeout: TIMEOUT_MS,
        }, (response) => {
            const length = Number(response.headers['content-length'])
            if (Number.isFinite(length) && length > MAX_HTML_BYTES) {
                response.destroy()
                return finish(new RecipeUrlAcquisitionError('too_large'))
            }
            if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
                response.destroy()
                return finish(new RecipeUrlAcquisitionError('invalid_source'))
            }
            const chunks: Buffer[] = []
            let size = 0
            response.on('data', (chunk: Buffer) => {
                size += chunk.length
                if (size > MAX_HTML_BYTES) { response.destroy(); finish(new RecipeUrlAcquisitionError('too_large')) }
                else chunks.push(chunk)
            })
            response.on('end', () => finish(undefined, { status: response.statusCode || 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }))
            response.on('error', (error) => finish(new RecipeUrlAcquisitionError('fetch_failed', { cause: error })))
        })
        const onAbort = () => { request.destroy(); finish(new RecipeUrlAcquisitionError('timeout', { cause: signal.reason })) }
        signal.addEventListener('abort', onAbort, { once: true })
        request.on('timeout', onAbort)
        request.on('error', (error) => finish(new RecipeUrlAcquisitionError('fetch_failed', { cause: error })))
        request.end()
    })
}

export async function fetchRecipeHtml(rawUrl: string, signal?: AbortSignal): Promise<{ html: string; finalUrl: string }> {
    let url = validateUrl(rawUrl)
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
        const response = await requestPage(url, combined)
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.location
            if (!location || redirects === MAX_REDIRECTS) throw new RecipeUrlAcquisitionError('invalid_source')
            url = validateUrl(new URL(location, url).href)
            continue
        }
        if ([401, 403, 407, 429].includes(response.status)) throw new RecipeUrlAcquisitionError('access_denied')
        if (response.status < 200 || response.status >= 300) throw new RecipeUrlAcquisitionError('invalid_source')
        if (!/^(?:text\/html|application\/xhtml\+xml)\b/i.test(String(response.headers['content-type'] || ''))) throw new RecipeUrlAcquisitionError('invalid_source')
        if (BLOCKED_PAGE.test(response.body.slice(0, 30_000))) throw new RecipeUrlAcquisitionError('access_denied')
        return { html: response.body, finalUrl: url.href }
    }
    throw new RecipeUrlAcquisitionError('invalid_source')
}
