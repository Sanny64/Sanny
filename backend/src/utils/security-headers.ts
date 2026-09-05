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
