# Backend TODO List

## Security hardening and deployment

- [ ] Validate the hosted deployment before public production (after VPS/staging exists).
  - Provision isolated staging and verify compose/network/firewall behavior, real Auth0 login/logout and account lifecycle flows, JWT/refresh-token handling, deletion, pagination, and error contracts.
  - Record the environment, date, build, scope, outcomes, and residual risks in the deployment verification documentation. Keep this item open until hosted staging and production configuration are validated.
