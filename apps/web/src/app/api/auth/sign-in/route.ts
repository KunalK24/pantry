import { checkRequestOrigin, sessionCookie } from "@/lib/auth";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";
import { readBoundedJson, RequestTooLargeError } from "@/lib/request-json";
import { signInSchema } from "@/schemas/auth";
import { InvalidCredentialsError, signIn } from "@/services/auth-service";

export async function POST(request: Request) {
  const originResponse = checkRequestOrigin(request);
  if (originResponse) {
    return originResponse;
  }

  let input: unknown;

  try {
    input = await readBoundedJson(request, 8 * 1024);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return Response.json(
        { error: "Request body is too large" },
        { status: 413 },
      );
    }
    return Response.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const result = signInSchema.safeParse(input);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid sign-in",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const rateLimit = await checkAuthRateLimit(
    "sign-in",
    result.data.email,
    request,
  );
  if (rateLimit.status === "limited") {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  if (rateLimit.status === "unavailable") {
    return Response.json({ error: "Service Unavailable" }, { status: 503 });
  }

  try {
    const { user, session } = await signIn(result.data);

    return Response.json(
      { user },
      {
        status: 200,
        headers: {
          "Set-Cookie": sessionCookie(session),
        },
      },
    );
  } catch (error) {
    if (error instanceof InvalidCredentialsError) {
      return Response.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    console.error(error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
