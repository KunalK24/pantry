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

export function imageContentError(
  data: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
): 400 | 413 | null {
  const dataError = imageDataError(data);
  if (dataError !== null) {
    return dataError;
  }

  const bytes = Buffer.from(data.replace(/\s/g, ""), "base64");
  if (mimeType === "image/jpeg") {
    return bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
      ? null
      : 400;
  }
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length &&
      signature.every((value, index) => bytes[index] === value)
      ? null
      : 400;
  }
  return bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
    ? null
    : 400;
}
