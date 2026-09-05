# Backend TODO List

## Ongoing tasks

1. [] Address gaps

- Account-link-cleanup.ts seems to not trigger after 10mins only on manual abort -> add event when account linking process is started.
- User deletion in auth0 dashboard doesn't work for google users
- Full Fastify hook/pre-handler integration, including cookie replacement during rotation.
- Redis-backed session rotation, refresh expiry, malformed records, concurrent refresh, and atomic replacement.
- Proof that refresh-token fields survive session-ID rotation.
- The `requireSession` plus `requireRecentAuthentication` boundary case.
- OAuth invalid, replayed, expired, concurrent, and high-volume state behavior.
- CSRF cases for missing origin, malformed referer, absent fetch-site, logout, and trusted proxy deployments.
- Subject-based account linking, email change, duplicate migration handling, and verified-email policy.
- Auth0/local deletion failures, retry/reconciliation, admin deletion, and session invalidation.
- Pagination bounds, stable error envelopes, and unexpected database/upstream failures.
- Production-mode HSTS and Swagger exposure policy.
- Rate-limit unique-query, IPv6, proxy, multi-process, OAuth-GET, and route-group behavior.
- Deployed Auth0 action/claim contract verification.

2. [] Complete role synchronization only after subject linkage is in place (RISK-01).

- Use the stored Auth0 subject, not email, and test successful sync, removal, invalid roles, provider failures, and repeated requests before enabling it.
- Verify it works for linked users as well.
- Remove the enable role synchronization safety net (if still existing) so role sync is always enabled.

**Remaining:** Complete and verify the live management API sync flow before exposing the endpoint.

## Open tasks


3. [] Verify the deployed Auth0 tenant and claim contract **!! OP-TASK !!**

- Database action scripts were tested manually; callback/logout URLs, PKCE, refresh-token rotation, offline access, Management API scopes, actions, and namespaced claims still require full tenant verification.
- Source validation covers issuer, audience, signature, subject, expiry, permissions, roles, email/name, email verification handling, and HTTPS-only production redirect URLs; automated coverage passes.
- Required authorization claims fail closed, and the non-secret contract checklist is documented in `docs/docs/backend/auth0-tenant-contract.mdx`.

### Security hardening and deployment

4. [] Set up NGINX as the TLS-terminating reverse proxy in front of the Fastify backend.

- Configure rate limits for `/api/v001/auth`, `/api/v001/auth/callback`, `/api/v001/auth/logout`, and sensitive `/api/v001/users` routes.
- Add `Retry-After` handling and `429` responses for abuse traffic.
- Keep the app private behind the proxy and do not expose Fastify directly to the internet.

5. [] Configure ingress monitoring and alerting.

- Track repeated `429`s, callback floods, auth abuse spikes, and suspicious request patterns.
- Route sanitized proxy logs to centralized monitoring.
- Expose NGINX metrics to Prometheus and create Grafana panels/alerts for request rates, callback spikes, and abuse traffic.

6. [] Keep application-layer defenses in place.

- Preserve Fastify rate limiting, CSRF enforcement, secure host-only cookies, security headers, no-store responses, and sanitized security logging.
- Monitor session rotation, refresh reuse detection, deletion reconciliation, and rate-limit failures.

7. [] Validate the full deployment in staging.

- Verify NGINX and application limits block abuse without breaking normal auth flows.
- Confirm JWT/session handling and forwarding-header behavior behind the proxy.
- Run end-to-end auth, account lifecycle, deletion, refresh, pagination, and error-contract checks.
- Document the production configuration, tenant settings, operational runbooks, and residual risks.

## Finishing touches

8. [] Add extensive documentation to `docs/docs/backend`

- Started `docs/docs/backend/operations.mdx` with environment, Auth0, Redis, proxy, monitoring, staging, and incident-response guidance.
- Make sure no secrets are leaked.

## Existing controls to preserve

- Authorization Code Flow with PKCE and single-use server-side OAuth state.
- Server-side sessions with secure host-only cookies and CSRF protection.
- Recent-authentication enforcement for sensitive routes.
- Access-token issuer, audience, signature, and subject validation.
- Prisma public-field selections that exclude `User.password`.
- Security headers, production HSTS, and no-store response caching.
