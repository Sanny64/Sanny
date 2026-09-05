# Backend Security Risk Assessment

Date: 2026-08-21
Scope: `backend/` source, Auth0 database actions, Prisma schema/client usage, tests, and the repository dependency graph inspected on this date.

### RISK-01: Management API role synchronization is unavailable and unsafe to assume

Severity: Medium
Status: Open
Evidence: [`updateUserRolesHandler`](backend/src/controllers/user.controller.ts) intentionally keeps the live endpoint unavailable unless the explicit role-sync gate is enabled, and validates the configured role allowlist. [`auth0-management.ts`](backend/src/utils/auth0-management.ts) contains the Management API helper, but the live flow still requires completion of authorization, audit events, idempotency, least-privilege scope verification, and end-to-end tests.

Impact: An administrator may expect roles to change while no change occurs. Implementing it later without subject linkage risks assigning roles to the wrong identity. The helper also performs list/list/assign/remove calls and should be treated as an audited privileged operation.

Recommendation: Keep the endpoint unavailable until the remaining controls and tests exist. Then use the stored subject, validate the allowlist, apply least-privilege Management API scopes, and return a clear success/failure result. This is an admin action, so additional server-side calls are acceptable and should not be part of ordinary user flows.
