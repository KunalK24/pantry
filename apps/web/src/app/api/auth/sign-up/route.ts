import { checkRequestOrigin, sessionCookie } from "@/lib/auth";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";
import { readBoundedJson, RequestTooLargeError } from "@/lib/request-json";
import { signUpSchema } from "@/schemas/auth";
import { EmailAlreadyRegisteredError, signUp } from "@/services/auth-service";

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

  const result = signUpSchema.safeParse(input);

  if (!result.success) {
    return Response.json(
      {
        error: "Invalid sign-up",
        details: result.error.flatten(),
      },
      { status: 400 },
    );
  }

  const rateLimit = await checkAuthRateLimit(
    "sign-up",
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
    const { user, session } = await signUp(result.data);

    return Response.json(
      { user },
      {
        status: 201,
        headers: {
          "Set-Cookie": sessionCookie(session),
        },
      },
    );
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError) {
      return Response.json(
        { error: "Email already registered" },
        { status: 409 },
      );
    }

    console.error(error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
