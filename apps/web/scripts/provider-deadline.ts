export function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new DOMException(`Timed out after ${timeoutMs} ms`, "TimeoutError");
      controller.abort(error);
      reject(error);
    }, timeoutMs);

    try {
      operation(controller.signal).then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}
