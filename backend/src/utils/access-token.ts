import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";

type JwtClaims = Record<string, unknown>;

const DEFAULT_ROLES_CLAIM = "https://sanny64.app/roles";
const DEFAULT_EMAIL_CLAIM = "https://sanny64.app/email";
const DEFAULT_NAME_CLAIM = "https://sanny64.app/name";
const DEFAULT_EMAIL_VERIFIED_CLAIM = "https://sanny64.app/email_verified";

function getStringClaim(claims: JwtClaims, key: string): string | null {
  const value = claims[key];
  return typeof value === "string" ? value : null;
}

function getStringArrayClaim(claims: JwtClaims, key: string): string[] {
  const value = claims[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function parseAudience(claims: JwtClaims): string[] {
  const rawAudience = claims.aud;
  if (typeof rawAudience === "string") {
    return [rawAudience];
  }
  if (Array.isArray(rawAudience)) {
    return rawAudience.filter(
      (entry): entry is string => typeof entry === "string",
    );
  }
  return [];
}

function parsePermissions(claims: JwtClaims): string[] {
  const explicitPermissions = getStringArrayClaim(claims, "permissions");
  if (explicitPermissions.length > 0) {
    return explicitPermissions;
  }

  const rawScope = claims.scope;
  if (typeof rawScope !== "string") {
    return [];
  }

  return rawScope.split(" ").filter(Boolean);
}

function getIdentityClaim(
  claims: JwtClaims,
  envName: string,
  defaultClaim: string,
): string | null {
  const configuredClaim = process.env[envName]?.trim();

  if (configuredClaim && configuredClaim.length > 0) {
    return getStringClaim(claims, configuredClaim);
  }

  const namespacedValue = getStringClaim(claims, defaultClaim);
  if (namespacedValue) {
    return namespacedValue;
  }

  return null;
}

function getBooleanClaim(claims: JwtClaims, key: string): boolean | null {
  const value = claims[key];
  return typeof value === "boolean" ? value : null;
}

// The Post Login Actions (roleClaims.js/verifyEmail.js) stamp verification
// status onto a namespaced custom claim (configured via
// AUTH0_EMAIL_VERIFIED_CLAIM) because API access tokens do not carry the raw
// OIDC `email_verified` claim by default. Mirror the email/name resolution
// pattern so this backend actually reads the claim the Actions set.
function getEmailVerifiedClaim(
  claims: JwtClaims,
  envName: string,
  defaultClaim: string,
): boolean | null {
  const configuredClaim = process.env[envName]?.trim();

  if (configuredClaim && configuredClaim.length > 0) {
    return getBooleanClaim(claims, configuredClaim);
  }

  const namespacedValue = getBooleanClaim(claims, defaultClaim);
  if (namespacedValue !== null) {
    return namespacedValue;
  }

  return null;
}

export type AccessTokenIdentity = {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  roles: string[];
  permissions: string[];
  audiences: string[];
};

export async function verifyIdTokenMfa(idToken: string): Promise<boolean> {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  if (!domain || !clientId) {
    throw new AccessTokenValidationError(
      "Auth0 ID token verification is not configured",
    );
  }

  const issuer = `https://${domain}/`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer,
    audience: clientId,
  });
  return Array.isArray(payload.amr) && payload.amr.includes("mfa");
}

export class AccessTokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessTokenValidationError";
  }
}

export function getAccessTokenIdentity(
  request: FastifyRequest,
): AccessTokenIdentity {
  if (request.sannySession) return request.sannySession;

  // Resource server policy: only API access tokens are accepted in this backend.
  const claims = (request.user ?? {}) as unknown as JwtClaims;
  const sub = getStringClaim(claims, "sub");

  if (!sub) {
    throw new AccessTokenValidationError(
      "Missing subject claim in access token",
    );
  }

  const expectedAudience = process.env.AUTH0_AUDIENCE;
  const audiences = parseAudience(claims);

  if (!expectedAudience) {
    throw new AccessTokenValidationError(
      "AUTH0_AUDIENCE environment variable must be set",
    );
  }

  if (!audiences.includes(expectedAudience)) {
    throw new AccessTokenValidationError(
      "Token audience does not match API audience",
    );
  }

  const rolesClaim = process.env.AUTH0_ROLES_CLAIM ?? DEFAULT_ROLES_CLAIM;
  const email =
    getIdentityClaim(claims, "AUTH0_EMAIL_CLAIM", DEFAULT_EMAIL_CLAIM) ??
    getStringClaim(claims, "email");
  const emailVerified =
    getEmailVerifiedClaim(
      claims,
      "AUTH0_EMAIL_VERIFIED_CLAIM",
      DEFAULT_EMAIL_VERIFIED_CLAIM,
    ) ?? claims.email_verified === true;
  const name =
    getIdentityClaim(claims, "AUTH0_NAME_CLAIM", DEFAULT_NAME_CLAIM) ??
    getStringClaim(claims, "name");

  return {
    sub,
    email,
    emailVerified,
    name,
    roles: getStringArrayClaim(claims, rolesClaim),
    permissions: parsePermissions(claims),
    audiences,
  };
}

export async function verifyAccessTokenIdentity(
  accessToken: string,
): Promise<AccessTokenIdentity> {
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE;
  if (!domain || !audience) {
    throw new AccessTokenValidationError(
      "Auth0 token verification is not configured",
    );
  }

  const issuer = `https://${domain}/`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));
  const { payload } = await jwtVerify(accessToken, jwks, { issuer, audience });
  return getIdentityFromClaims(payload as JwtClaims);
}

function getIdentityFromClaims(claims: JwtClaims): AccessTokenIdentity {
  const sub = getStringClaim(claims, "sub");
  if (!sub)
    throw new AccessTokenValidationError(
      "Missing subject claim in access token",
    );

  const audiences = parseAudience(claims);
  const expectedAudience = process.env.AUTH0_AUDIENCE;
  if (!expectedAudience || !audiences.includes(expectedAudience)) {
    throw new AccessTokenValidationError(
      "Token audience does not match API audience",
    );
  }

  const rolesClaim = process.env.AUTH0_ROLES_CLAIM ?? DEFAULT_ROLES_CLAIM;
  const email =
    getIdentityClaim(claims, "AUTH0_EMAIL_CLAIM", DEFAULT_EMAIL_CLAIM) ??
    getStringClaim(claims, "email");
  const emailVerified =
    getEmailVerifiedClaim(
      claims,
      "AUTH0_EMAIL_VERIFIED_CLAIM",
      DEFAULT_EMAIL_VERIFIED_CLAIM,
    ) ?? claims.email_verified === true;
  const name =
    getIdentityClaim(claims, "AUTH0_NAME_CLAIM", DEFAULT_NAME_CLAIM) ??
    getStringClaim(claims, "name");
  return {
    sub,
    email,
    emailVerified,
    name,
    roles: getStringArrayClaim(claims, rolesClaim),
    permissions: parsePermissions(claims),
    audiences,
  };
}
