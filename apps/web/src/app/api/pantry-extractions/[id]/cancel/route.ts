import { AiJobType } from "@/generated/prisma/client";
import { requireAuth } from "@/lib/auth";
import { aiJobIdSchema } from "@/schemas/ai-job";
import { cancelAiJobForUser } from "@/services/ai-job-service";
import { publicPantryImportJob } from "../../job-response";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await requireAuth(request);
  if (auth.response) {
    return auth.response;
  }
  const { id } = await context.params;
  const parsed = aiJobIdSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json({ error: "Pantry import not found" }, { status: 404 });
  }
  const job = await cancelAiJobForUser(
    parsed.data,
    auth.user.id,
    AiJobType.PANTRY_IMPORT,
  );
  if (!job) {
    return Response.json({ error: "Pantry import not found" }, { status: 404 });
  }
  return Response.json(publicPantryImportJob(job));
}
