import { z } from "zod";
import { emailSchema, passwordSchema } from "./schemas.js";

const userCore = z.object({
  email: emailSchema,
  name: z.string().min(1).max(100),
});

export const createUserSchema = userCore.extend({
  password: passwordSchema,
});

export const createUserResponseSchema = userCore.extend({
  id: z.number(),
});

export const userSchemas = {
  createUserSchema,
  createUserResponseSchema,
};