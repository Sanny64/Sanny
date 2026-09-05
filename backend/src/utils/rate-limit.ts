import type { FastifyReply, FastifyRequest } from "fastify";
import {
  SESSION_COOKIE,
  getSessionStoreClient,
  getSessionSubject,
} from "./session.js";

export type RateLimitConfig = {
  max: number;
  timeWindow: string;
  windowMs: number;
  ban: number;
  group: string;
};

export type RateLimitDecision = {
  allowed: boolean;
  retryAfterMs: number;
  status?: number;
};

type RateLimitRequest = Pick<
  FastifyRequest,
  "ip" | "method" | "url" | "cookies"
>;

const rateLimitKeyPrefix = "sanny:rate-limit:";
const fallbackMaxKeys = 10_000;
const fallbackBuckets = new Map<string, { count: number; expiresAt: number }>();

const incrementScript = `
  local current = redis.call("INCR", KEYS[1])
  if current == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
  return { current, redis.call("PTTL", KEYS[1]) }
`;

function pathname(url: string): string {
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return "/";
  }
}

function getClientKey(request: Pick<RateLimitRequest, "ip">): string {
  return request.ip.trim() || "unknown";
}

export function getRateLimitConfig(
  path: string,
  method = "GET",
): RateLimitConfig {
  const route = pathname(path);
  const normalizedMethod = method.toUpperCase();

  if (route === "/api/v001/auth/callback") {
    return {
      max: 20,
      timeWindow: "1 minute",
      windowMs: 60_000,
      ban: 0,
      group: "oauth-callback",
    };
  }
  if (route === "/api/v001/auth") {
    return {
      max: 10,
      timeWindow: "1 minute",
      windowMs: 60_000,
      ban: 0,
      group: "oauth-initiation",
    };
  }
  if (route === "/api/v001/auth/logout") {
    return {
      max: 10,
      timeWindow: "1 minute",
      windowMs: 60_000,
      ban: 0,
      group: "logout",
    };
  }
  if (
    ["/api/v001/users/me", "/api/v001/users/me/password-reset"].includes(
      route,
    ) &&
    ["POST", "PATCH", "DELETE"].includes(normalizedMethod)
  ) {
    return {
      max: 12,
      timeWindow: "1 minute",
      windowMs: 60_000,
      ban: 0,
      group: "self-mutation",
    };
  }
  if (
    route.endsWith("/roles") ||
    (route.startsWith("/api/v001/users/") && normalizedMethod === "DELETE")
  ) {
    return {
      max: 10,
      timeWindow: "1 minute",
      windowMs: 60_000,
      ban: 0,
      group: "admin-expensive",
    };
  }
  if (
    route.startsWith("/api/v001/users/") &&
    ["PATCH", "PUT", "POST"].includes(normalizedMethod)
  ) {
    return {
      max: 30,
      timeWindow: "1 minute",
      windowMs: 60_000,
      ban: 0,
      group: "admin-mutation",
    };
  }
  return {
    max: 100,
    timeWindow: "1 minute",
    windowMs: 60_000,
    ban: 0,
    group: "unlimited-route",
  };
}

export function isRateLimitRoute(path: string, method = "GET"): boolean {
  const route = pathname(path);
  return (
    route === "/api/v001/auth" ||
    route.startsWith("/api/v001/auth/") ||
    route === "/api/v001/users/me" ||
    (route.startsWith("/api/v001/users/") && method !== "GET")
  );
}

function fallbackIncrement(
  key: string,
  windowMs: number,
): { count: number; ttl: number } {
  const now = Date.now();
  for (const [entryKey, entry] of fallbackBuckets) {
    if (entry.expiresAt <= now) fallbackBuckets.delete(entryKey);
  }
  if (!fallbackBuckets.has(key) && fallbackBuckets.size >= fallbackMaxKeys) {
    const oldestKey = fallbackBuckets.keys().next().value as string | undefined;
    if (oldestKey) fallbackBuckets.delete(oldestKey);
  }
  const entry = fallbackBuckets.get(key);
  if (!entry || entry.expiresAt <= now) {
    const next = { count: 1, expiresAt: now + windowMs };
    fallbackBuckets.set(key, next);
    return { count: next.count, ttl: windowMs };
  }
  entry.count += 1;
  return { count: entry.count, ttl: Math.max(entry.expiresAt - now, 0) };
}

export async function applyRateLimit(
  request: RateLimitRequest,
  reply: Pick<FastifyReply, "header">,
): Promise<RateLimitDecision> {
  const path = request.url ?? "/";
  if (!isRateLimitRoute(path, request.method))
    return { allowed: true, retryAfterMs: 0 };

  const config = getRateLimitConfig(path, request.method);
  let subject: string | null = null;
  if (request.cookies?.[SESSION_COOKIE]) {
    try {
      subject = await getSessionSubject(request.cookies[SESSION_COOKIE]);
    } catch {
      subject = null;
    }
  }
  const key = `${getClientKey(request)}:${subject ?? "anonymous"}:${config.group}`;
  let count: number;
  let retryAfterMs: number;

  try {
    const result = (await getSessionStoreClient().eval(incrementScript, {
      keys: [`${rateLimitKeyPrefix}${key}`],
      arguments: [String(config.windowMs)],
    })) as [number, number];
    count = Number(result[0]);
    retryAfterMs = Math.max(Number(result[1]), 0);
  } catch {
    const fallback = fallbackIncrement(key, config.windowMs);
    count = fallback.count;
    retryAfterMs = fallback.ttl;
  }

  if (count <= config.max) return { allowed: true, retryAfterMs: 0 };

  reply.header(
    "Retry-After",
    String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
  );
  reply.header("X-RateLimit-Limit", String(config.max));
  reply.header("X-RateLimit-Remaining", "0");
  return { allowed: false, retryAfterMs, status: 429 };
}
