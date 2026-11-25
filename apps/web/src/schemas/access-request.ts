import { z } from "zod";

export const accessRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  reason: z.string().trim().min(10).max(2000),
});

export type AccessRequestInput = z.infer<typeof accessRequestSchema>;
