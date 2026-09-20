# Backend TODO List

## Ongoing tasks

1. [ ] Fix bugs

- [ ] password reset doesn't work (admin flow) https://localhost:8443/api/v001/users/6/password-reset; Request Method: POST; Status Code: 401 Unauthorized
- [ ] password reset doesn't work (self flow) 
- [ ] the self roles and available roles endpoint always only returns "{"roles":[]}" 

2. [ ] Re-authentication flow

- in multiple instances an admin is required to reauthenticate themselves before doing changes to users.
    - in those cases the admin usually already inserted values in the user field but after reauthentication the role values, username changes, etc. are gone and need to be inserted again; that should change. 
        - save state and recreate it after verification.
            - note: for risky changes like role promotion and password reset the admin is required to always reauthenticate themselves with an Authenticator App unless they previously did so within the last 15 minutes.   Password authentication is not enough.
            - note: requireMfaAuthentication is called in an preHandler. Save states must be saved accordingly in order for them to be restored after authentication.
            - note: user name only changes do not require reauthentication with the Authenticator App. Only role promotion and password reset.

- self password reset should not require authenticator app based reauthentication but instead use an email OTP verification.

3. [ ] Verify features

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

4. [ ] Address Aikido findings

- See "problems" tab after triggering an AIKAIDO Workspace Scan
- npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
- npm warn deprecated rimraf@2.7.1: Rimraf versions prior to v4 are no longer supported
- npm warn deprecated glob@7.2.3: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me
- npm warn deprecated uuid@8.3.2: uuid@10 and below is no longer supported.  For ESM codebases, update to uuid@latest.  For CommonJS codebases, use uuid@11 (but be aware this version will likely be deprecated in 2028).

5. [ ] Complete role synchronization only after subject linkage is in place (RISK-01).

- Use the stored Auth0 subject, not email, and test successful sync, removal, invalid roles, provider failures, and repeated requests before enabling it.
- Verify it works for linked users as well.
- Remove the enable role synchronization safety net (if still existing) so role sync is always enabled.

**Remaining:** Complete and verify the live management API sync flow before exposing the endpoint.

6. [ ] Implement error handling 
 - error redirects must lead to an error handler page not a json response.
    - rate limiting response
 - implement toasts
    - add toast to show the user they must relogin soon 15mins before the TTL session has been exceeded after 8hrs.


7. [ ] Verify the deployed Auth0 tenant and claim contract **!! OP-TASK !!**

- Database action scripts were tested manually; callback/logout URLs, PKCE, refresh-token rotation, offline access, Management API scopes, actions, and namespaced claims still require full tenant verification.
- Source validation covers issuer, audience, signature, subject, expiry, permissions, roles, email/name, email verification handling, and HTTPS-only production redirect URLs; automated coverage passes.
- Required authorization claims fail closed, and the non-secret contract checklist is documented in `docs/docs/backend/auth0-tenant-contract.mdx`.

### Security hardening and deployment

8. [ ] Validate the full deployment in staging.

- Verify NGINX and application limits block abuse without breaking normal auth flows.
- Confirm JWT/session handling and forwarding-header behavior behind the proxy.
- Run end-to-end auth, account lifecycle, deletion, refresh, pagination, and error-contract checks.
- Document the production configuration, tenant settings, operational runbooks, and residual risks.

## Finishing touches

9. [ ] Add extensive documentation to `docs/docs/backend`

- Started `docs/docs/backend/operations.mdx` with environment, Auth0, Redis, proxy, monitoring, staging, and incident-response guidance.
- Make sure no secrets are leaked.

## Existing controls to preserve

- Authorization Code Flow with PKCE and single-use server-side OAuth state.
- Server-side sessions with secure host-only cookies and CSRF protection.
- Recent-authentication enforcement for sensitive routes.
- Access-token issuer, audience, signature, and subject validation.
- Prisma public-field selections that exclude `User.password`.
- Security headers, production HSTS, and no-store response caching.
