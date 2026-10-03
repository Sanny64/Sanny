export function getHstsPolicy(environment = process.env.NODE_ENV) {
  return environment === "production"
    ? { maxAge: 31536000, includeSubDomains: true }
    : false;
}

export function applySecurityHeaders(
  request: { url?: string; method?: string },
  reply: { header: (name: string, value: string) => unknown },
) {
  reply.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  if (request.url?.startsWith("/api/v001/")) {
    reply.header("Cache-Control", "no-store");
  }
}
