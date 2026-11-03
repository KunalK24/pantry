import { requireAuth } from "@/lib/auth";
import { checkImportRateLimit } from "@/lib/import-rate-limit";
import { imageContentError, MAX_IMAGE_REQUEST_BYTES } from "@/lib/image-upload";
import { readBoundedJson, RequestTooLargeError } from "@/lib/request-json";
import { pantryExtractionRequestSchema } from "@/schemas/pantry-item";
import { PantryImportError } from "@/services/pantry-extraction-service";
import { extractPantrySynchronously, ImportDeadlineError } from "@/services/synchronous-import-service";

export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth.response) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await readBoundedJson(request, MAX_IMAGE_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return Response.json(
        { error: "Pantry Extraction request is too large" },
        { status: 413 },
      );
    }
    return Response.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const parsed = pantryExtractionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid pantry extraction request" },
      { status: 400 },
    );
  }

  const errorStatus = imageContentError(
    parsed.data.image.data,
    parsed.data.image.mimeType,
  );
  if (errorStatus) {
    return Response.json(
      {
        error:
          errorStatus === 413 ? "Image exceeds 3 MiB" : "Invalid image data",
      },
      { status: errorStatus },
    );
  }

  const rateLimit = await checkImportRateLimit(auth.user.id);
  if (rateLimit.status === "limited") {
    return Response.json(
      { error: "Daily import limit reached. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }
  if (rateLimit.status === "unavailable") {
    return Response.json({ error: "Pantry import is temporarily unavailable" }, { status: 503 });
  }

  try {
    const draft = await extractPantrySynchronously(parsed.data);
    return Response.json({ draft });
  } catch (error) {
    if (error instanceof ImportDeadlineError || error instanceof PantryImportError && error.code === "timeout") {
      return Response.json({ error: "Pantry import timed out. Please try again." }, { status: 504 });
    }
    if (error instanceof PantryImportError) {
      if (error.code === "rate_limited") { return Response.json({ error: "Pantry provider is busy. Please try again." }, { status: 429 }); }
      if (error.code === "not_configured") { return Response.json({ error: "Pantry import is unavailable" }, { status: 503 }); }
      if (error.code === "invalid_source") { return Response.json({ error: "Invalid pantry image" }, { status: 400 }); }
      return Response.json({ error: "Pantry import failed. Please try again." }, { status: 502 });
    }
    console.error("[pantry-extraction] unexpected failure", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
