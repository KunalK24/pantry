import { checkNativeRequestOrigin } from "@/lib/auth";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";
import { readBoundedJson, RequestTooLargeError } from "@/lib/request-json";
import { signInSchema } from "@/schemas/auth";
import { InvalidCredentialsError, signIn } from "@/services/auth-service";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const originResponse = checkNativeRequestOrigin(request);
  if (originResponse) {
    return originResponse;
  }

  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Unsupported content type" }, { status: 415, headers: noStore });
  }

  let input: unknown;
  try {
    input = await readBoundedJson(request, 8 * 1024);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return Response.json({ error: "Request body is too large" }, { status: 413, headers: noStore });
    }
    return Response.json({ error: "Malformed JSON" }, { status: 400, headers: noStore });
  }

  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid sign-in", details: parsed.error.flatten() },
      { status: 400, headers: noStore },
    );
  }

  const rateLimit = await checkAuthRateLimit("sign-in", parsed.data.email, request);
  if (rateLimit.status === "limited") {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { ...noStore, "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }
  if (rateLimit.status === "unavailable") {
    return Response.json({ error: "Service Unavailable" }, { status: 503, headers: noStore });
  }

  try {
    const { user, session } = await signIn(parsed.data);
    return Response.json(
      { user, token: session.token, expiresAt: session.expiresAt.toISOString() },
      { status: 200, headers: noStore },
    );
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return Response.json({ error: "Invalid email or password" }, { status: 401, headers: noStore });
    }
    console.error(error);
    return Response.json({ error: "Internal Server Error" }, { status: 500, headers: noStore });
  }
}
