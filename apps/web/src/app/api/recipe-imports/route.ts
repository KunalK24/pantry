import { requireAuth } from "@/lib/auth";
import { imageDataError, MAX_IMAGE_REQUEST_BYTES } from "@/lib/image-upload";
import { readBoundedJson, RequestTooLargeError } from "@/lib/request-json";
import { recipeInputRequestSchema } from "@/schemas/recipe";
import {
  ActiveImportLimitError,
  AiJobEnqueueError,
  createAiJob,
} from "@/services/ai-job-service";

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
            errorStatus === 413 ? "Image exceeds 5 MiB" : "Invalid image data",
        },
        { status: errorStatus },
      );
    }
  }
  try {
    const job = await createAiJob({
      jobType: "recipe_import",
      input: parsed.data,
      userId: auth.user.id,
    });
    return Response.json(
      {
        id: job.id,
        status: "queued",
        sourceType: parsed.data.type,
        stage: "queued",
        expiresAt: job.expiresAt.toISOString(),
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof AiJobEnqueueError) {
      return Response.json(
        { error: "Recipe import queue is unavailable" },
        { status: 503 },
      );
    }
    if (error instanceof ActiveImportLimitError) {
      return Response.json(
        { error: "Too many active recipe imports" },
        { status: 429 },
      );
    }
    throw error;
  }
}
