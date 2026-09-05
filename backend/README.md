# Backend

## Rate limiting and proxy trust

The backend uses an atomic Redis fixed-window limiter. OAuth initiation and callback, logout, self-service mutations, and admin mutations use separate route groups. Keys contain Fastify's resolved client IP, the authenticated session subject when available, and the normalized route group; query strings are never included.

Redis failures use a bounded local fallback of 10,000 active keys. This fallback is an availability policy, not a replacement for shared enforcement, and deployments should alert on Redis errors.

`TRUST_PROXY` defaults to `false`. Set it to `true` only when the ingress overwrites `X-Forwarded-For` and `X-Forwarded-Proto`; or set an explicit IP/CIDR string (or comma-separated list) matching the trusted proxy chain. Numeric hop counts are not supported — Fastify disabled that mode because it cannot validate the immediate peer and lets direct clients spoof `X-Forwarded-*` headers. Never expose Fastify directly to untrusted clients while proxy trust is enabled.
