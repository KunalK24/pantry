const LOCAL_API_BASE_URL = "http://localhost:3000";

export function getApiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL ?? (__DEV__ ? LOCAL_API_BASE_URL : "");

  if (!raw) {
    throw new Error("Set EXPO_PUBLIC_API_BASE_URL to your Pantry API URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be a valid URL.");
  }

  const isLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !(__DEV__ && isLocal && parsed.protocol === "http:")) ||
    parsed.origin !== raw
  ) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be an HTTPS origin or a local HTTP origin in development.");
  }

  return parsed.origin;
}
