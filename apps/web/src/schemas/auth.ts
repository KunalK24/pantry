import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const passwordSchema = z.string().min(8).max(200);

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
