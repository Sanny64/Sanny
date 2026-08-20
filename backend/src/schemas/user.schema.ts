import { z } from "zod";
import { emailSchema } from "./schemas.js";

export const userCoreSchema = z.object({
  email: emailSchema,
  name: z.string().min(1).max(100),
});

export const createSelfUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const updateSelfUserSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100),
});

export const userIdParamSchema = z.object({
  userId: z.coerce.number().int().positive(),
});

export const updateUserRolesSchema = z.object({
  roles: z.array(z.string().min(1)).max(50),
});

export const updateUserRolesResponseSchema = z.object({
  roles: z.array(z.string()),
});

export const createUserResponseSchema = userCoreSchema.extend({
  id: z.number(),
});

export const userSchemas = {
  createSelfUserSchema,
  updateSelfUserSchema,
  updateUserSchema,
  userIdParamSchema,
  updateUserRolesSchema,
  updateUserRolesResponseSchema,
  createUserResponseSchema,
};
