import http from "node:http";
import https from "node:https";
import { AiJobStatus, AiJobType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { MAX_IMAGE_BYTES } from "@/lib/image-upload";
import { recipeInputSchema } from "@/schemas/recipe";
import { RecipeNotFoundError } from "@/services/recipe-service";
import { pinAddress, validateUrl } from "@/services/recipe-url-acquisition-service";
import { z } from "zod";

const mimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type RecipeImageMime = (typeof mimeTypes)[number];

export class RecipeImageError extends Error {
  constructor(public readonly code: "invalid_image" | "too_large" | "invalid_candidate" | "source_unavailable") {
    super(code);
  }
}

export function validateImage(data: Buffer, mimeType: string): RecipeImageMime {
  if (data.length > MAX_IMAGE_BYTES) {throw new RecipeImageError("too_large");}
  const type = mimeType.split(";")[0].trim().toLowerCase();
  if (!mimeTypes.includes(type as RecipeImageMime)) {throw new RecipeImageError("invalid_image");}
  const valid = type === "image/jpeg"
    ? data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
    : type === "image/png"
      ? data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP";
  if (!valid) {throw new RecipeImageError("invalid_image");}
  return type as RecipeImageMime;
}

async function ownedRecipe(userId: string, recipeId: string) {
  const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, userId }, select: { id: true } });
  if (!recipe) {throw new RecipeNotFoundError(recipeId);}
}

export async function getRecipeImage(userId: string, recipeId: string) {
  await ownedRecipe(userId, recipeId);
  return prisma.recipeImage.findUnique({ where: { recipeId } });
}

export async function saveRecipeImage(userId: string, recipeId: string, data: Buffer, mimeType: string) {
  const type = validateImage(data, mimeType);
  await ownedRecipe(userId, recipeId);
  await prisma.recipeImage.upsert({
    where: { recipeId },
    create: { recipeId, data: Uint8Array.from(data), mimeType: type },
    update: { data: Uint8Array.from(data), mimeType: type },
  });
  return `/api/recipes/${recipeId}/image`;
}

export async function deleteRecipeImage(userId: string, recipeId: string) {
  await ownedRecipe(userId, recipeId);
  await prisma.recipeImage.deleteMany({ where: { recipeId } });
}

async function fetchImage(raw: string): Promise<{ data: Buffer; mimeType: RecipeImageMime }> {
  let url = validateUrl(raw);
  const signal = AbortSignal.timeout(12_000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const pinned = await new Promise<Awaited<ReturnType<typeof pinAddress>>>((resolve, reject) => {
      if (signal.aborted) {
        reject(new RecipeImageError("source_unavailable"));
        return;
      }
      const onAbort = () => reject(new RecipeImageError("source_unavailable"));
      signal.addEventListener("abort", onAbort, { once: true });
      pinAddress(url).then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
    const transport = url.protocol === "https:" ? https : http;
    const response = await new Promise<{ status: number; location?: string; type: string; data: Buffer }>((resolve, reject) => {
      const request = transport.request(url, {
        agent: false,
        lookup: (_host, options, callback) => {
          if (typeof options === "object" && options.all) {callback(null, [pinned]);}
          else {callback(null, pinned.address, pinned.family);}
        },
        headers: { Accept: "image/jpeg,image/png,image/webp", "Accept-Encoding": "identity", "User-Agent": "PantryRecipeImporter/1.0" },
      }, (incoming) => {
        const type = String(incoming.headers["content-type"] || "");
        const length = Number(incoming.headers["content-length"] || 0);
        if (length > MAX_IMAGE_BYTES || incoming.headers["content-encoding"] && incoming.headers["content-encoding"] !== "identity") {
          incoming.destroy(); reject(new RecipeImageError("too_large")); return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        incoming.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_IMAGE_BYTES) { incoming.destroy(); reject(new RecipeImageError("too_large")); }
          else {chunks.push(chunk);}
        });
        incoming.on("end", () => resolve({ status: incoming.statusCode || 0, location: incoming.headers.location, type, data: Buffer.concat(chunks) }));
        incoming.on("error", reject);
      });
      const abort = () => request.destroy(new Error("Image fetch timed out"));
      signal.addEventListener("abort", abort, { once: true });
      request.on("close", () => signal.removeEventListener("abort", abort));
      request.on("error", reject);
      request.end();
    });
    if (response.status >= 300 && response.status < 400 && response.location && redirects < 3) {
      url = validateUrl(new URL(response.location, url).href);
      continue;
    }
    if (response.status !== 200) {throw new RecipeImageError("source_unavailable");}
    return { data: response.data, mimeType: validateImage(response.data, response.type) };
  }
  throw new RecipeImageError("source_unavailable");
}

const storedResultSchema = z.object({
  draft: recipeInputSchema,
  imageCandidate: z.object({ kind: z.literal("source_url"), url: z.url() }),
});

export async function saveImportedRecipeImage(userId: string, recipeId: string, importJobId: string) {
  await ownedRecipe(userId, recipeId);
  const job = await prisma.aiJob.findFirst({
    where: { id: importJobId, userId, type: AiJobType.RECIPE_IMPORT, status: AiJobStatus.SUCCEEDED, expiresAt: { gt: new Date() } },
    select: { resultJson: true },
  });
  const result = storedResultSchema.safeParse(job?.resultJson);
  if (!result.success) {throw new RecipeImageError("invalid_candidate");}
  try {
    const image = await fetchImage(result.data.imageCandidate.url);
    return saveRecipeImage(userId, recipeId, image.data, image.mimeType);
  } catch (error) {
    if (error instanceof RecipeImageError) {throw error;}
    throw new RecipeImageError("source_unavailable");
  }
}
