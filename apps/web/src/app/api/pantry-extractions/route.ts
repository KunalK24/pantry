import { requireAuth } from "@/lib/auth";
import { imageDataError, MAX_IMAGE_REQUEST_BYTES } from "@/lib/image-upload";
import { readBoundedJson, RequestTooLargeError } from "@/lib/request-json";
import { pantryExtractionRequestSchema } from "@/schemas/pantry-item";
import {
  extractPantryItems,
  PantryImportError,
} from "@/services/pantry-extraction-service";

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

  const errorStatus = imageDataError(parsed.data.image.data);
  if (errorStatus) {
    return Response.json(
      {
        error:
          errorStatus === 413 ? "Image exceeds 5 MiB" : "Invalid image data",
      },
      { status: errorStatus },
    );
  }

  try {
    const items = await extractPantryItems(parsed.data);
    return Response.json({ items }, { status: 200 });
  } catch (error) {
    if (error instanceof PantryImportError) {
      const status = {
        invalid_source: 400,
        invalid_extraction: 502,
        rate_limited: 429,
        not_configured: 503,
        provider_failure: 503,
        timeout: 504,
      }[error.code];
      return Response.json(
        { error: "Pantry extraction failed", code: error.code },
        { status },
      );
    }
    console.error("[pantry-extraction] unexpected failure", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
