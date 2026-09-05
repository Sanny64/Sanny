import type { createSelfUserSchema } from "../schemas/user.schema.js";
import type { updateSelfUserSchema } from "../schemas/user.schema.js";
import type { updateUserRolesSchema } from "../schemas/user.schema.js";
import type { updateUserSchema } from "../schemas/user.schema.js";
import type { userIdParamSchema } from "../schemas/user.schema.js";
import type { userEmailQuerySchema } from "../schemas/user.schema.js";
import { z } from "zod";

export type CreateSelfUserInput = z.infer<typeof createSelfUserSchema>;
export type UpdateSelfUserInput = z.infer<typeof updateSelfUserSchema>;
export type UpdateUserRolesInput = z.infer<typeof updateUserRolesSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserIdParamInput = z.infer<typeof userIdParamSchema>;
export type UserEmailQueryInput = z.infer<typeof userEmailQuerySchema>;
