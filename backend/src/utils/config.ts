type Environment = "development" | "production";

function getEnvironment(): Environment {
  const environment = process.env.NODE_ENV?.trim();
  if (environment === "development" || environment === "production") {
    return environment;
  }

  throw new Error("NODE_ENV must be exactly development or production");
}

export function isProduction() {
  return getEnvironment() === "production";
}

export function getEnvironmentSpecificVariable(
  name: string,
): string | undefined {
  const prefix = isProduction() ? "PROD" : "DEV";
  return process.env[`${prefix}_${name}`]?.trim() || undefined;
}

export function isSwaggerEnabled(): boolean {
  if (isProduction()) {
    return process.env.ENABLE_SWAGGER?.trim().toLowerCase() === "true";
  }
  return true;
}

export function getTrustProxy(): boolean | string {
  const value = getEnvironmentSpecificVariable("TRUST_PROXY")?.trim();
  if (!value || value.toLowerCase() === "false") return false;
  if (value.toLowerCase() === "true") return true;
  // Fastify deliberately disabled hop-count-only trust proxy support: a bare
  // number cannot validate the immediate peer and lets direct clients spoof
  // X-Forwarded-* headers. Require an explicit IP/CIDR string (or
  // comma-separated list) that matches the trusted proxy chain instead.
  if (/^\d+$/.test(value)) {
    throw new Error(
      "TRUST_PROXY must be false, true, or an IP/CIDR string — numeric hop counts are not supported",
    );
  }
  return value;
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} environment variable must be set`);
  return value;
}

export function requiredEnvironmentSpecificEnv(name: string): string {
  const value = getEnvironmentSpecificVariable(name);
  if (!value) {
    const prefix = isProduction() ? "PROD" : "DEV";
    throw new Error(`${prefix}_${name} environment variable must be set`);
  }
  return value;
}

export function requiredProductionUrl(name: string): string {
  const value = requiredEnvironmentSpecificEnv(name);
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production`);
  }

  return value;
}

function requiredUrl(name: string): string {
  const value = requiredEnvironmentSpecificEnv(name);
  try {
    new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL`);
  }
  return value;
}

export function getCallbackUrl() {
  return isProduction()
    ? requiredProductionUrl("AUTH0_CALLBACK_URL")
    : requiredEnvironmentSpecificEnv("AUTH0_CALLBACK_URL");
}

export function getAccountLinkProofCallbackUrl() {
  return new URL("account-link-proof/callback", getCallbackUrl()).toString();
}

export function getAccountLinkFrontendUrl() {
  return isProduction()
    ? requiredProductionUrl("ACCOUNT_LINK_FRONTEND_URL")
    : requiredEnvironmentSpecificEnv("ACCOUNT_LINK_FRONTEND_URL");
}

export function getSuccessRedirectUrl() {
  return isProduction()
    ? requiredProductionUrl("AUTH0_SUCCESS_REDIRECT")
    : requiredEnvironmentSpecificEnv("AUTH0_SUCCESS_REDIRECT");
}

export function getLogoutRedirectUrl() {
  return isProduction()
    ? requiredProductionUrl("AUTH0_LOGOUT_REDIRECT")
    : requiredEnvironmentSpecificEnv("AUTH0_LOGOUT_REDIRECT");
}

export function getCorsOrigins() {
  const origins = requiredEnvironmentSpecificEnv("CORS_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0 || origins.includes("*")) {
    throw new Error("CORS_ORIGINS must contain one or more exact origins");
  }

  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`CORS origin is not a valid URL: ${origin}`);
    }
    if (
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      !["http:", "https:"].includes(url.protocol)
    ) {
      throw new Error(
        `CORS origin must contain only scheme and host: ${origin}`,
      );
    }
    if (isProduction() && url.protocol !== "https:") {
      throw new Error(`CORS origin must use HTTPS in production: ${origin}`);
    }
  }

  return origins;
}

export function validateProductionConfig() {
  const domain = requiredEnv("AUTH0_DOMAIN");
  if (domain.includes("/") || domain.includes(":") || domain.includes("?")) {
    throw new Error("AUTH0_DOMAIN must be a hostname without a scheme or path");
  }
  requiredEnv("AUTH0_AUDIENCE");
  requiredEnv("AUTH0_CLIENT_ID");
  requiredEnv("AUTH0_CLIENT_SECRET");
  if (isProduction()) {
    requiredProductionUrl("AUTH0_CALLBACK_URL");
    requiredProductionUrl("AUTH0_SUCCESS_REDIRECT");
    requiredProductionUrl("AUTH0_LOGOUT_REDIRECT");
    requiredProductionUrl("ACCOUNT_LINK_FRONTEND_URL");
  } else {
    requiredUrl("AUTH0_CALLBACK_URL");
    requiredUrl("AUTH0_SUCCESS_REDIRECT");
    requiredUrl("AUTH0_LOGOUT_REDIRECT");
    requiredUrl("ACCOUNT_LINK_FRONTEND_URL");
  }
  requiredEnv("DATABASE_URL");
  requiredEnvironmentSpecificEnv("REDIS_URL");
  getCorsOrigins();
}
