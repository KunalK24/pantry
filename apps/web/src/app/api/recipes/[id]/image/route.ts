import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { MAX_IMAGE_BYTES } from "@/lib/image-upload";
import { recipeIdSchema } from "@/schemas/recipe";
import {
  deleteRecipeImage,
  getRecipeImage,
  RecipeImageError,
  saveImportedRecipeImage,
  saveRecipeImage,
} from "@/services/recipe-image-service";
import { RecipeNotFoundError } from "@/services/recipe-service";

type Context = { params: Promise<{ id: string }> };
const importBodySchema = z.object({ importJobId: z.cuid() });

async function contextFor(request: Request, context: Context) {
  const auth = await requireAuth(request);
  if (auth.response) {
    return { response: auth.response };
  }
  const id = recipeIdSchema.safeParse((await context.params).id);
  if (!id.success) {
    return { response: Response.json({ error: "Invalid recipe ID" }, { status: 400 }) };
  }
  return { userId: auth.user.id, recipeId: id.data };
}

function errorResponse(error: unknown) {
  if (error instanceof RecipeNotFoundError) {
    return Response.json({ error: "Recipe not found" }, { status: 404 });
  }
  if (error instanceof RecipeImageError) {
    const status = error.code === "too_large" ? 413 : error.code === "source_unavailable" ? 502 : 400;
    return Response.json({ error: error.code }, { status });
  }
  console.error("[recipe-image] unexpected error", error);
  return Response.json({ error: "Internal Server Error" }, { status: 500 });
}

async function readBoundedBody(request: Request, limit: number): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) {
    throw new RecipeImageError("invalid_image");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RecipeImageError("too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function GET(request: Request, context: Context) {
  const scope = await contextFor(request, context);
  if (scope.response) {
    return scope.response;
  }
  try {
    const image = await getRecipeImage(scope.userId!, scope.recipeId!);
    if (!image) {
      return Response.json({ error: "Image not found" }, { status: 404 });
    }
    return new Response(new Uint8Array(image.data), {
      headers: {
        "Content-Type": image.mimeType,
        "Content-Length": String(image.data.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: Context) {
  const scope = await contextFor(request, context);
  if (scope.response) {
    return scope.response;
  }
  try {
    let imageUrl: string;
    const contentType = request.headers.get("content-type") || "";
    if (contentType.startsWith("multipart/form-data")) {
      const body = await readBoundedBody(request, MAX_IMAGE_BYTES + 64 * 1024);
      const bounded = new Request(request.url, {
        method: "POST",
        headers: { "content-type": contentType },
        body: new Uint8Array(body),
      });
      const form = await bounded.formData();
      const file = form.get("file");
      if (!(file instanceof File) || [...form.keys()].some((key) => key !== "file") || form.getAll("file").length !== 1) {
        return Response.json({ error: "Invalid upload" }, { status: 400 });
      }
      if (file.size > MAX_IMAGE_BYTES) {
        throw new RecipeImageError("too_large");
      }
      imageUrl = await saveRecipeImage(scope.userId!, scope.recipeId!, Buffer.from(await file.arrayBuffer()), file.type);
    } else if (contentType.startsWith("application/json")) {
      const body = await readBoundedBody(request, 1024);
      const parsed = importBodySchema.safeParse(JSON.parse(body.toString("utf8")));
      if (!parsed.success) {
        return Response.json({ error: "Invalid input" }, { status: 400 });
      }
      imageUrl = await saveImportedRecipeImage(scope.userId!, scope.recipeId!, parsed.data.importJobId);
    } else {
      return Response.json({ error: "Unsupported content type" }, { status: 415 });
    }
    return Response.json({ imageUrl });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return Response.json({ error: "Invalid input" }, { status: 400 });
    }
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  const scope = await contextFor(request, context);
  if (scope.response) {
    return scope.response;
  }
  try {
    await deleteRecipeImage(scope.userId!, scope.recipeId!);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
