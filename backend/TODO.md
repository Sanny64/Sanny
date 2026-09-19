# Backend TODO List

## Ongoing tasks

1. [x] Fix bugs

- [x] Login only works for non-admin accounts: Fixed roleClaims.js to fallback to user_metadata.roles if authorization.roles is empty
- [x] Logout doesn't work: Fixed CSRF check to allow logout POST requests even with cross-site fetch-site header
- [x] "Load all users" returns 500: Service properly handles pagination with defaults
- [x] "Update user roles" returns 403: Enhanced error message to show what roles user actually has
- [x] "Password reset" returns 401: Changed response from 204 (No Content) to 200 with success message to properly handle popup redirect
    - [x] Self password reset also fixed
    - [x] Popup redirect issue: Changed to return 200 with JSON response instead of 204, allowing frontend to handle completion before redirecting

2. [] Verify features

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

3. [] Address Aikido findings

- See "problems" tab after triggering an AIKAIDO Workspace Scan
- npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
- npm warn deprecated rimraf@2.7.1: Rimraf versions prior to v4 are no longer supported
- npm warn deprecated glob@7.2.3: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me
- npm warn deprecated uuid@8.3.2: uuid@10 and below is no longer supported.  For ESM codebases, update to uuid@latest.  For CommonJS codebases, use uuid@11 (but be aware this version will likely be deprecated in 2028).

4. [] Complete role synchronization only after subject linkage is in place (RISK-01).

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

5. [] Validate the full deployment in staging.

- Verify NGINX and application limits block abuse without breaking normal auth flows.
- Confirm JWT/session handling and forwarding-header behavior behind the proxy.
- Run end-to-end auth, account lifecycle, deletion, refresh, pagination, and error-contract checks.
- Document the production configuration, tenant settings, operational runbooks, and residual risks.

## Finishing touches

6. [] Add extensive documentation to `docs/docs/backend`

- Started `docs/docs/backend/operations.mdx` with environment, Auth0, Redis, proxy, monitoring, staging, and incident-response guidance.
- Make sure no secrets are leaked.

## Existing controls to preserve

- Authorization Code Flow with PKCE and single-use server-side OAuth state.
- Server-side sessions with secure host-only cookies and CSRF protection.
- Recent-authentication enforcement for sensitive routes.
- Access-token issuer, audience, signature, and subject validation.
- Prisma public-field selections that exclude `User.password`.
- Security headers, production HSTS, and no-store response caching.
