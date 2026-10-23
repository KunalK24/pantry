export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_REQUEST_BYTES = 7_100_000;

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;

export function imageDataError(data: string): 400 | 413 | null {
  const compact = data.replace(/\s/g, "");
  if (!compact) {
    return 400;
  }
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  const decodedBytes = (compact.length / 4) * 3 - padding;
  if (decodedBytes > MAX_IMAGE_BYTES) {
    return 413;
  }
  if (!BASE64_PATTERN.test(compact)) {
    return 400;
  }
  if (Buffer.from(compact, "base64").toString("base64") !== compact) {
    return 400;
  }
  return null;
}
