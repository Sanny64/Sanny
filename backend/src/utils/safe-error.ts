export type SafeErrorResponse = {
  status: number;
  error: string;
  message: string;
};

export function createSafeErrorResponse(
  error: unknown,
  fallbackStatus = 500,
): SafeErrorResponse {
  const status =
    Number.isInteger(fallbackStatus) && fallbackStatus >= 400
      ? fallbackStatus
      : 500;

  const normalized =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";
  const safeDetail = normalized
    .replace(
      /(access[_-]?token|refresh[_-]?token|session[_-]?id|csrf[_-]?token|authorization|code|secret|cookie)/gi,
      "[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (status === 401) {
    return {
      status: 401,
      error: "Unauthorized",
      message: "Authentication required.",
    };
  }

  if (status === 403) {
    return {
      status: 403,
      error: "Forbidden",
      message: "Access denied.",
    };
  }

  if (status === 404) {
    return {
      status: 404,
      error: "Not found",
      message: "The requested resource was not found.",
    };
  }

  if (status === 429) {
    return {
      status: 429,
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please retry later.",
    };
  }

  if (status >= 500 && status === 503) {
    return {
      status: 503,
      error: "Service unavailable",
      message: "The service is temporarily unavailable.",
    };
  }

  if (status >= 500) {
    return {
      status: 500,
      error: "Internal server error",
      message: "An internal error occurred.",
    };
  }

  return {
    status,
    error: "Bad request",
    message: safeDetail
      ? "The request could not be processed."
      : "The request could not be processed.",
  };
}
