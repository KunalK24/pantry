export const MAX_JSON_REQUEST_BYTES = 1024 * 1024;

export class RequestTooLargeError extends Error {}

export async function readBoundedJson(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > maxBytes) {
    throw new RequestTooLargeError();
  }

  if (!request.body) {
    return JSON.parse("");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      void reader.cancel().catch(() => undefined);
      throw new RequestTooLargeError();
    }
    chunks.push(value);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
