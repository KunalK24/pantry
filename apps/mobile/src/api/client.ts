import { getApiBaseUrl } from "@/config";

export type ApiErrorKind = "configuration" | "network" | "http" | "invalid-response";

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  token?: string;
  body?: unknown;
};

const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(
  path: `/${string}`,
  options: RequestOptions,
  readResponse: (response: Response) => Promise<T>,
): Promise<T> {
  let url: string;
  try {
    url = `${getApiBaseUrl()}${path}`;
  } catch (error) {
    throw new ApiError(
      "configuration",
      error instanceof Error ? error.message : "Invalid API configuration.",
    );
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new ApiError("network", "Request timed out. Check your connection and try again."));
    }, REQUEST_TIMEOUT_MS);
  });

  const performRequest = async () => {
    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers,
        signal: controller.signal,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });
    } catch {
      throw new ApiError("network", "Unable to reach Pantry. Check the server and try again.");
    }

    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null);
      const message =
        typeof payload === "object" && payload !== null && "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : `Pantry returned HTTP ${response.status}.`;
      throw new ApiError("http", message, response.status);
    }

    return readResponse(response);
  };

  try {
    return await Promise.race([performRequest(), deadline]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function parseJson<T>(response: Response, isResponse: (value: unknown) => value is T): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("invalid-response", "Pantry returned an unreadable response.");
  }
  if (!isResponse(payload)) {
    throw new ApiError("invalid-response", "Pantry returned an unexpected response.");
  }
  return payload;
}

export async function getJson<T>(
  path: `/${string}`,
  isResponse: (value: unknown) => value is T,
  token?: string,
): Promise<T> {
  return request(path, { token }, (response) => parseJson(response, isResponse));
}

export async function postJson<T>(
  path: `/${string}`,
  body: unknown,
  isResponse: (value: unknown) => value is T,
  token?: string,
): Promise<T> {
  return request(path, { method: "POST", body, token }, (response) => parseJson(response, isResponse));
}

export async function putJson<T>(
  path: `/${string}`,
  body: unknown,
  isResponse: (value: unknown) => value is T,
  token: string,
): Promise<T> {
  return request(path, { method: "PUT", body, token }, (response) => parseJson(response, isResponse));
}

export async function deleteJson<T>(
  path: `/${string}`,
  isResponse: (value: unknown) => value is T,
  token: string,
): Promise<T> {
  return request(path, { method: "DELETE", token }, (response) => parseJson(response, isResponse));
}

export async function postNoContent(path: `/${string}`, token: string): Promise<void> {
  return request(path, { method: "POST", token }, async (response) => {
    if (response.status !== 204) {
      throw new ApiError("invalid-response", "Pantry returned an unexpected response.");
    }
  });
}
