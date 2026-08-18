import { z } from "zod";
import { emailSchema, passwordSchema } from "./schemas.js";

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginResponseSchema = z.object({
  accessToken: z.string(),
});

export const authSchemas = {
    loginSchema,
    loginResponseSchema,
}