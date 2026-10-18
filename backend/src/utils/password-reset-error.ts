import type { Auth0ManagementError } from "./auth0-management.js";
import { PasswordResetMailError } from "./password-reset-mail.js";
import {
  createSafeErrorResponse,
  type SafeErrorResponse,
} from "./safe-error.js";

export function createPasswordResetErrorResponse(
  error: Auth0ManagementError | PasswordResetMailError,
): SafeErrorResponse {
  if (error instanceof PasswordResetMailError) {
    return {
      status: 503,
      error: "Service unavailable",
      message:
        "Password reset email delivery is unavailable. Contact an administrator.",
    };
  }
  if (error.statusCode === 429) {
    return createSafeErrorResponse(error, 429);
  }

  const mfaConfigurationError = error.message
    .toLowerCase()
    .includes("mfa customized via postlogin action but feature is not enabled");

  // Auth0 rejected a server-to-server request, not the user's Sanny session.
  return {
    status: 502,
    error: "Bad gateway",
    message: mfaConfigurationError
      ? "Password reset is unavailable because Auth0 MFA is not configured. Contact an administrator."
      : "Auth0 could not send the password reset email. Contact an administrator.",
  };
}
