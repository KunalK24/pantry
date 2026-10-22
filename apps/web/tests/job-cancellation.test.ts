import { afterEach, describe, expect, it, vi } from 'vitest'
import { watchJobCancellation } from '@/workers/job-cancellation'

afterEach(() => {
    vi.useRealTimers()
})

describe('worker cancellation watch', () => {
    it('aborts a running import when its persisted status is no longer processing', async () => {
        vi.useFakeTimers()
        const controller = new AbortController()
        const isProcessing = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
        const onError = vi.fn()
        const stop = watchJobCancellation(controller, isProcessing, onError, 500)
        await vi.advanceTimersByTimeAsync(500)
        expect(controller.signal.aborted).toBe(false)
        await vi.advanceTimersByTimeAsync(500)
        expect(controller.signal.aborted).toBe(true)
        expect(onError).not.toHaveBeenCalled()
        stop()
    })

    it('stops polling once the job reaches a terminal state', async () => {
        vi.useFakeTimers()
        const controller = new AbortController()
        const isProcessing = vi.fn().mockResolvedValue(true)
        const stop = watchJobCancellation(controller, isProcessing, vi.fn(), 500)
        await vi.advanceTimersByTimeAsync(500)
        stop()
        await vi.advanceTimersByTimeAsync(1500)
        expect(isProcessing).toHaveBeenCalledTimes(1)
    })

    it('keeps polling after a transient status read failure', async () => {
        vi.useFakeTimers()
        const controller = new AbortController()
        const isProcessing = vi.fn()
            .mockRejectedValueOnce(new Error('Database unavailable'))
            .mockResolvedValueOnce(false)
        const onError = vi.fn()
        const stop = watchJobCancellation(controller, isProcessing, onError, 500)
        await vi.advanceTimersByTimeAsync(1000)
        expect(onError).toHaveBeenCalledTimes(1)
        expect(controller.signal.aborted).toBe(true)
        stop()
    })
})
