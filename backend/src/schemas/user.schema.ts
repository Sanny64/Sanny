import { z } from "zod";

export const emailSchema = z.email({
  error: (issue) =>
    issue.input === undefined ? "Email is required" : "Invalid email address",
});

export const userCoreSchema = z.object({
  email: emailSchema,
  username: z.string().min(1).max(100),
});

export const createSelfUserSchema = z.object({
  username: z.string().min(1).max(100).optional(),
});

export const updateSelfUserSchema = z.object({
  username: z.string().min(1).max(100),
});

export const updateUserSchema = z.object({
  username: z.string().min(1).max(100),
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

export const linkUserAccountsSchema = z.object({
  primaryAuth0Sub: z.string().min(1),
  secondaryAuth0Sub: z.string().min(1),
});

export const userSchemas = {
  createSelfUserSchema,
  updateSelfUserSchema,
  updateUserSchema,
  userIdParamSchema,
  updateUserRolesSchema,
  updateUserRolesResponseSchema,
  createUserResponseSchema,
  linkUserAccountsSchema,
};
