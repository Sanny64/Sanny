import { appLogger } from "./logger.js";

const SENSITIVE_KEYWORDS = [
  "authorization",
  "cookie",
  "csrf",
  "password",
  "secret",
  "session",
  "state",
  "token",
  "code",
  "user",
  "email",
  "sub",
  "ip",
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function normalizeAuditPath(path: string): string {
  if (path === "/healthcheck" || path === "/metrics") return path;
  if (path === "/api/v001/auth/callback") return "/api/v001/auth/callback";
  if (path.startsWith("/api/v001/auth")) return "/api/v001/auth";
  if (path.startsWith("/api/v001/users/me")) return "/api/v001/users/me";
  if (path.startsWith("/api/v001/users/")) return "/api/v001/users/:id";
  if (path.startsWith("/api/v001/")) return "/api/v001/other";
  return path;
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if ((key === "path" || key === "url") && typeof value === "string") {
    try {
      return normalizeAuditPath(new URL(value, "http://localhost").pathname);
    } catch {
      return "/";
    }
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, key));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        if (isSensitiveKey(key)) {
          return [];
        }

        return [[key, sanitizeValue(entry, key)]];
      }),
    );
  }

  return value;
}

export function logSecurityEvent<T extends Record<string, unknown>>(
  event: string,
  details: T,
) {
  const sanitized = sanitizeValue(details) as T;
  const payload = {
    event,
    occurredAt: new Date().toISOString(),
    ...sanitized,
  };
  appLogger.warn(payload);
  return payload;
}
