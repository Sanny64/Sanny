# Backend

## Account linking

Google/password identity conflicts require confirmation and authentication of
the other identity through the login frontend. The OAuth callback restarts Auth0
authorization once for an unresolved Google/password conflict, preserving the
return destination and email-MFA requirement. It does not create a session or
merge users before Auth0 proves the link. If the retry still returns unlinked
identities, it redirects to the auth error page rather than looping.

Deploy `auth0/post-login/linkAccounts.js` to the Auth0 **Login** flow as well as
deploying the backend; the repository copy is not executed by the backend.
Pending or confirmed metadata must not suppress confirmation for identities
that are still unlinked. Proof logins (`link_proof=true`) still bypass the
linking prompt. Configure the development Action with `NODE_ENV=development`
and `DEV_ACCOUNT_LINK_CONFIRMATION_URL` pointing to the backend's
`/api/v001/auth/confirm-account-linking` endpoint (not directly to the frontend).
The backend's `DEV_ACCOUNT_LINK_FRONTEND_URL` points to the login frontend's
`/confirm-linking` page.

## Automated testing

Run `npm run test:backend` from the repository root for the backend type-check and unit suite. Run `npm run test:backend:redis` for the Redis-backed session integration test; Docker must be available.

The root `npm run test` runs formatting, backend type/unit/monitoring tests, real-Redis integration, frontend lint/build and shared component tests, mocked Playwright tests, and the live password-user Auth0 flow in headed Chromium, Firefox, and Edge. Docs build remains separate. Mocked UI tests verify frontend behavior and API contracts, not the deployed backend. The live flow needs a reachable development API/Auth0 tenant and dedicated test credentials. Google automation is explicitly skipped, and Cloudflare challenges may skip password login; see the [backend automated testing guide](../documenation/docs/backend/local-testing/automated-testing.mdx) for backend coverage and the [frontend automated testing guide](../documenation/docs/frontend/local-testing/automated-testing.mdx) for frontend-owned coverage.

## Rate limiting and proxy trust

The backend uses an atomic Redis fixed-window limiter. OAuth initiation and callback, logout, self-service mutations, and admin mutations use separate route groups. Keys contain Fastify's resolved client IP, the authenticated session subject when available, and the normalized route group; query strings are never included.

Redis failures use a bounded local fallback of 10,000 active keys. This fallback is an availability policy, not a replacement for shared enforcement, and deployments should alert on Redis errors.

`TRUST_PROXY` defaults to `false`. Set it to `true` only when the ingress overwrites `X-Forwarded-For` and `X-Forwarded-Proto`; or set an explicit IP/CIDR string (or comma-separated list) matching the trusted proxy chain. Numeric hop counts are not supported — Fastify disabled that mode because it cannot validate the immediate peer and lets direct clients spoof `X-Forwarded-*` headers. Never expose Fastify directly to untrusted clients while proxy trust is enabled.
