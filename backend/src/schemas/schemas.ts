import { z } from "zod";

export const emailSchema = z.email({
  error: (issue) =>
    issue.input === undefined ? "Email is required" : "Invalid email address",
});

export const passwordSchema = z
  .string({
    error: (issue) =>
      issue.input === undefined
        ? "Password is required"
        : "Password must be a string",
  })
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password must be under 100 characters");