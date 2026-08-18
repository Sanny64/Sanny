import type { createUserSchema } from "../schemas/user.schema.js";
import type { loginSchema } from "../schemas/auth.schema.js";
import { z } from "zod";

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
