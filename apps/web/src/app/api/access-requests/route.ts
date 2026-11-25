import { checkRequestOrigin } from "@/lib/auth";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";
import { readBoundedJson, RequestTooLargeError } from "@/lib/request-json";
import { accessRequestSchema } from "@/schemas/access-request";
import { AccessRequestDeliveryError, sendAccessRequest } from "@/services/access-request-service";

export async function POST(request: Request) {
  const originResponse = checkRequestOrigin(request);
  if (originResponse) {
    return originResponse;
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, 8 * 1024);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return Response.json({ error: "Request body is too large" }, { status: 413 });
    }
    return Response.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const parsed = accessRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid access request", details: parsed.error.flatten() }, { status: 400 });
  }

  const rateLimit = await checkAuthRateLimit("access-request", parsed.data.email, request);
  if (rateLimit.status === "limited") {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }
  if (rateLimit.status === "unavailable") {
    return Response.json({ error: "Service Unavailable" }, { status: 503 });
  }

  try {
    await sendAccessRequest(parsed.data);
    return Response.json({ message: "Request received" }, { status: 202 });
  } catch (error) {
    if (error instanceof AccessRequestDeliveryError) {
      return Response.json({ error: "Service Unavailable" }, { status: 503 });
    }
    console.error(error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
