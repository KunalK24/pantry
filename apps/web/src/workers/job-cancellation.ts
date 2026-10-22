export function watchJobCancellation(
    controller: AbortController,
    isProcessing: () => Promise<boolean>,
    onPollError: (error: unknown) => void,
    intervalMs = 500,
) {
    let stopped = false
    let checking = false
    const poll = async () => {
        if (stopped || checking || controller.signal.aborted) return
        checking = true
        try {
            if (!await isProcessing() && !stopped) {
                controller.abort(new Error('Recipe import is no longer processing'))
            }
        } catch (error) {
            onPollError(error)
        } finally {
            checking = false
        }
    }
    const timer = setInterval(() => { void poll() }, intervalMs)
    timer.unref()
    return () => {
        stopped = true
        clearInterval(timer)
    }
}
