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
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        if (isSensitiveKey(key)) {
          return [];
        }

        return [[key, sanitizeValue(entry)]];
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

  console.warn(JSON.stringify(payload));
  return payload;
}
