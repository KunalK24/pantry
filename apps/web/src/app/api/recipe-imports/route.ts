import { requireAuth } from "@/lib/auth";
import { checkImportRateLimit } from "@/lib/import-rate-limit";
import { imageDataError, MAX_IMAGE_REQUEST_BYTES } from "@/lib/image-upload";
import { readBoundedJson, RequestTooLargeError } from "@/lib/request-json";
import { recipeInputRequestSchema } from "@/schemas/recipe";
import { RecipeImportError } from "@/services/recipe-import-service";
import { ImportDeadlineError, importRecipeSynchronously } from "@/services/synchronous-import-service";

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
        { error: "Recipe import request is too large" },
        { status: 413 },
      );
    }
    return Response.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const parsed = recipeInputRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid recipe import request" },
      { status: 400 },
    );
  }
  if (parsed.data.type === "image") {
    const errorStatus = imageDataError(parsed.data.image.data);
    if (errorStatus) {
      return Response.json(
        {
          error:
            errorStatus === 413 ? "Image exceeds 3 MiB" : "Invalid image data",
        },
        { status: errorStatus },
      );
    }
  }
  const rateLimit = await checkImportRateLimit(auth.user.id);
  if (rateLimit.status === "limited") {
    return Response.json(
      { error: "Daily import limit reached. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }
  if (rateLimit.status === "unavailable") {
    return Response.json({ error: "Recipe import is temporarily unavailable" }, { status: 503 });
  }
  try {
    const result = await importRecipeSynchronously(parsed.data, auth.user.id);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ImportDeadlineError || error instanceof RecipeImportError && error.code === "timeout") {
      return Response.json({ error: "Recipe import timed out. Please try again." }, { status: 504 });
    }
    if (error instanceof RecipeImportError) {
      if (error.code === "rate_limited") { return Response.json({ error: "Recipe provider is busy. Please try again." }, { status: 429 }); }
      if (error.code === "not_configured") { return Response.json({ error: "Recipe import is unavailable" }, { status: 503 }); }
      if (error.code === "invalid_source" || error.code === "source_access_denied") { return Response.json({ error: "Recipe source could not be accessed" }, { status: 422 }); }
      return Response.json({ error: "Recipe import failed. Please try again." }, { status: 502 });
    }
    throw error;
  }
}
