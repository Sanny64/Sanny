import { z } from "zod";

export const meResponseSchema = z.object({
  sub: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});

export const authSchemas = {
    meResponseSchema,
}