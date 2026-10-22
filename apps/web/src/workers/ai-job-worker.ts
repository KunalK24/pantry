import { Worker } from 'bullmq'
import { redis } from '@/lib/redis'
import { AI_JOB_QUEUE_NAME, aiJobQueue } from '@/lib/ai-job-queue'
import {
    failAiJob,
    getAiJobById,
    isAiJobProcessing,
    markAiJobProcessing,
    reconcileStaleAiJobs,
    updateAiJobResult,
    updateAiJobStage,
} from '@/services/ai-job-service'
import { importRecipe, RecipeImportError } from '@/services/recipe-import-service'
import { recipeInputRequestSchema } from '@/schemas/recipe'
import { watchJobCancellation } from './job-cancellation'

const concurrency = Number(process.env.AI_JOB_WORKER_CONCURRENCY ?? '2')
const AI_JOB_TIMEOUT_MS = 90_000
const activeControllers = new Set<AbortController>()

function stopWhenAborted<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason)

        if (signal.aborted) {
            abort()
            return
        }

        signal.addEventListener('abort', abort, { once: true })
        operation.then(
            (result) => {
                signal.removeEventListener('abort', abort)
                resolve(result)
            },
            (error) => {
                signal.removeEventListener('abort', abort)
                reject(error)
            },
        )
    })
}

function failureDetails(error: unknown, timedOut: boolean) {
    if (timedOut) {
        return {
            code: 'timeout',
            message: `Recipe import timed out after ${AI_JOB_TIMEOUT_MS / 1000} seconds`,
            retryable: true,
        }
    }

    if (error instanceof RecipeImportError && error.code === 'timeout') {
        return {
            code: 'timeout',
            message: 'A recipe import step timed out. Please try again.',
            retryable: true,
        }
    }

    if (error instanceof RecipeImportError) {
        return {
            code: error.code,
            message: error.code === 'source_access_denied'
                ? 'Recipe source could not be accessed'
                : 'Recipe import failed',
            retryable: ['provider_failure', 'rate_limited'].includes(error.code),
        }
    }

    return {
        code: 'worker_failure',
        message: 'Recipe import failed',
        retryable: false,
    }
}

const worker = new Worker<{ aiJobId: string }>(
    AI_JOB_QUEUE_NAME,
    async (job) => {
        const { aiJobId } = job.data
        const startedAt = Date.now()
        const timeoutSignal = AbortSignal.timeout(AI_JOB_TIMEOUT_MS)
        const cancellation = new AbortController()
        const signal = AbortSignal.any([timeoutSignal, cancellation.signal])
        let stopWatching = () => {}

        console.info('[ai-job-worker] picked up job', {
            aiJobId,
            bullJobId: job.id,
            name: job.name,
            attempt: job.attemptsMade + 1,
            timeoutMs: AI_JOB_TIMEOUT_MS,
        })

        try {
            const aiJob = await getAiJobById(aiJobId)

            if (!aiJob) {
                throw new Error(`AI job ${aiJobId} was not found`)
            }

            if (aiJob.type !== 'RECIPE_IMPORT') {
                throw new Error(`Unsupported AI job type: ${aiJob.type}`)
            }

            const acquired = await markAiJobProcessing(aiJobId)
            if (!acquired) return
            activeControllers.add(cancellation)
            stopWatching = watchJobCancellation(
                cancellation,
                () => isAiJobProcessing(aiJobId),
                (error) => console.error('[ai-job-worker] cancellation poll failed', { aiJobId, error }),
            )
            console.info('[ai-job-worker] job marked processing', { aiJobId })

            const recipeInputRequest = recipeInputRequestSchema.safeParse(aiJob.inputJson)
            if (!recipeInputRequest.success) {
                throw new Error('Invalid stored recipe import input')
            }

            console.info('[ai-job-worker] starting recipe import', {
                aiJobId,
                sourceType: recipeInputRequest.data.type,
            })

            const draft = await stopWhenAborted(
                importRecipe(recipeInputRequest.data, {
                    signal,
                    onProgress: async (stage) => {
                        if (!await updateAiJobStage(aiJobId, stage)) {
                            cancellation.abort(new Error('Recipe import is no longer processing'))
                            throw cancellation.signal.reason
                        }
                    },
                }),
                signal,
            )

            if (timeoutSignal.aborted) {
                throw new RecipeImportError('timeout')
            }

            const result = await updateAiJobResult(draft, aiJobId)
            console.info('[ai-job-worker] job finished', {
                aiJobId,
                persisted: result,
                durationMs: Date.now() - startedAt,
            })
            return result
        } catch (error) {
            if (cancellation.signal.aborted && !timeoutSignal.aborted) {
                try {
                    if (!await isAiJobProcessing(aiJobId)) return
                } catch (statusError) {
                    console.error('[ai-job-worker] cancel status check failed', { aiJobId, statusError })
                }
            }
            const failure = failureDetails(error, timeoutSignal.aborted)

            console.error('[ai-job-worker] job failed', {
                aiJobId,
                bullJobId: job.id,
                durationMs: Date.now() - startedAt,
                errorCode: failure.code,
                errorName: error instanceof Error ? error.name : 'UnknownError',
                errorMessage: error instanceof Error ? error.message : String(error),
            })

            try {
                await failAiJob(aiJobId, failure)
            } catch (persistenceError) {
                console.error('[ai-job-worker] could not persist job failure', {
                    aiJobId,
                    error: persistenceError instanceof Error
                        ? persistenceError.message
                        : String(persistenceError),
                })
            }

            throw error instanceof Error ? error : new Error(String(error))
        } finally {
            stopWatching()
            activeControllers.delete(cancellation)
        }
    },
    {
        connection: redis,
        concurrency,
    },
)

worker.on('ready', () => {
    console.info('[ai-job-worker] ready', {
        queue: AI_JOB_QUEUE_NAME,
        concurrency,
        timeoutMs: AI_JOB_TIMEOUT_MS,
    })
})

worker.on('completed', (job) => {
    console.info('[ai-job-worker] BullMQ marked job completed', {
        aiJobId: job.data.aiJobId,
        bullJobId: job.id,
    })
})

worker.on('failed', (job, error) => {
    console.error('[ai-job-worker] BullMQ marked job failed', {
        aiJobId: job?.data.aiJobId,
        bullJobId: job?.id,
        attemptsMade: job?.attemptsMade,
        error: error.message,
    })
})

worker.on('stalled', (jobId) => {
    console.warn('[ai-job-worker] BullMQ job stalled', { bullJobId: jobId })
})

worker.on('error', (error) => {
    console.error('[ai-job-worker] worker error', {
        error: error.message,
    })
})

const reconciliation = setInterval(() => {
    reconcileStaleAiJobs().catch((error) => {
        console.error('[ai-job-worker] reconciliation failed', { error })
    })
}, 60_000)
reconciliation.unref()
reconcileStaleAiJobs().catch((error) => {
    console.error('[ai-job-worker] startup reconciliation failed', { error })
})

let shuttingDown = false
async function shutdown() {
    if (shuttingDown) return
    shuttingDown = true
    clearInterval(reconciliation)
    for (const controller of activeControllers) {
        controller.abort(new Error('Recipe import worker is shutting down'))
    }
    await Promise.allSettled([worker.close(), aiJobQueue.close()])
    await redis.quit()
}
process.once('SIGTERM', () => {
    void shutdown().catch((error) => console.error('[ai-job-worker] shutdown failed', { error }))
})
process.once('SIGINT', () => {
    void shutdown().catch((error) => console.error('[ai-job-worker] shutdown failed', { error }))
})
