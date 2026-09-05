type Auth0TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type Auth0Role = {
  id: string;
  name: string;
};

type Auth0VerificationJobResponse = {
  id?: string;
  status?: string;
  type?: string;
};

type Auth0UserVerificationResponse = {
  email_verified?: boolean;
};

type Auth0UserIdentitiesResponse = {
  identities?: Array<{ provider?: string; user_id?: string }>;
};

const deletionRetryCount = 3;
const deletionRetryDelayMs = 250;

export function isRoleSyncEnabled(): boolean {
  const value = process.env.AUTH0_ROLE_SYNC_ENABLED?.trim().toLowerCase();
  return value === "true";
}

export function getAllowedRoleNames(): string[] {
  const configured = process.env.AUTH0_ASSIGNABLE_ROLES?.trim();
  if (!configured) return [];

  return [
    ...new Set(
      configured
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Build the Auth0 Management API user search query used by purge/cleanup
 * tooling. Defaults to the Auth0 database connection provider; an operator
 * can scope it to a specific connection via AUTH0_PURGE_CONNECTION.
 */
export function getAuth0PurgeUserSearchQuery(): string {
  const connection = process.env.AUTH0_PURGE_CONNECTION?.trim();
  if (connection) {
    return `identities.connection:"${connection}"`;
  }
  return 'identities.provider:"auth0"';
}

export class Auth0ManagementError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "Auth0ManagementError";
    this.statusCode = statusCode;
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Auth0ManagementError(
      `${name} environment variable must be set`,
      500,
    );
  }
  return value;
}

function getManagementConfig() {
  const domain = getRequiredEnv("AUTH0_DOMAIN");
  const clientId = getRequiredEnv("AUTH0_M2M_CLIENT_ID");
  const clientSecret = getRequiredEnv("AUTH0_M2M_CLIENT_SECRET");
  const audience =
    process.env.AUTH0_MGMT_AUDIENCE?.trim() || `https://${domain}/api/v2/`;

  return {
    domain,
    clientId,
    clientSecret,
    audience,
  };
}

async function getManagementAccessToken(): Promise<string> {
  const { domain, clientId, clientSecret, audience } = getManagementConfig();

  const response = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Auth0ManagementError(
      `Failed to obtain Auth0 Management API token: ${text || response.statusText}`,
      response.status,
    );
  }

  const json = (await response.json()) as Auth0TokenResponse;
  if (!json.access_token) {
    throw new Auth0ManagementError(
      "Auth0 Management API token response missing access_token",
      500,
    );
  }

  return json.access_token;
}

async function auth0ManagementRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { domain } = getManagementConfig();
  const accessToken = await getManagementAccessToken();

  const response = await fetch(`https://${domain}/api/v2${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  return response;
}

function encodeAuth0Sub(auth0Sub: string): string {
  return encodeURIComponent(auth0Sub);
}

async function getAllRoles(): Promise<Auth0Role[]> {
  const response = await auth0ManagementRequest("/roles?per_page=100&page=0");

  if (!response.ok) {
    const text = await response.text();
    throw new Auth0ManagementError(
      `Failed to list Auth0 roles: ${text || response.statusText}`,
      response.status,
    );
  }

  return (await response.json()) as Auth0Role[];
}

async function getUserRoles(auth0Sub: string): Promise<Auth0Role[]> {
  const response = await auth0ManagementRequest(
    `/users/${encodeAuth0Sub(auth0Sub)}/roles`,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Auth0ManagementError(
      `Failed to list Auth0 user roles: ${text || response.statusText}`,
      response.status,
    );
  }

  return (await response.json()) as Auth0Role[];
}

async function assignRoles(auth0Sub: string, roleIds: string[]): Promise<void> {
  if (roleIds.length === 0) {
    return;
  }

  const response = await auth0ManagementRequest(
    `/users/${encodeAuth0Sub(auth0Sub)}/roles`,
    {
      method: "POST",
      body: JSON.stringify({ roles: roleIds }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Auth0ManagementError(
      `Failed to assign Auth0 roles: ${text || response.statusText}`,
      response.status,
    );
  }
}

async function removeRoles(auth0Sub: string, roleIds: string[]): Promise<void> {
  if (roleIds.length === 0) {
    return;
  }

  const response = await auth0ManagementRequest(
    `/users/${encodeAuth0Sub(auth0Sub)}/roles`,
    {
      method: "DELETE",
      body: JSON.stringify({ roles: roleIds }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Auth0ManagementError(
      `Failed to remove Auth0 roles: ${text || response.statusText}`,
      response.status,
    );
  }
}

export async function syncAuth0UserRolesByName(
  auth0Sub: string,
  requestedRoleNames: string[],
) {
  const desiredRoleNames = [
    ...new Set(requestedRoleNames.map((role) => role.trim()).filter(Boolean)),
  ];
  const [allRoles, currentRoles] = await Promise.all([
    getAllRoles(),
    getUserRoles(auth0Sub),
  ]);

  const roleByName = new Map(allRoles.map((role) => [role.name, role]));
  const missingRoles = desiredRoleNames.filter(
    (roleName) => !roleByName.has(roleName),
  );

  if (missingRoles.length > 0) {
    throw new Auth0ManagementError(
      `Unknown Auth0 roles: ${missingRoles.join(", ")}`,
      400,
    );
  }

  const desiredRoleIds = desiredRoleNames
    .map((roleName) => roleByName.get(roleName))
    .filter((role): role is Auth0Role => Boolean(role))
    .map((role) => role.id);

  const currentRoleIds = currentRoles.map((role) => role.id);

  const rolesToAdd = desiredRoleIds.filter(
    (id) => !currentRoleIds.includes(id),
  );
  const rolesToRemove = currentRoleIds.filter(
    (id) => !desiredRoleIds.includes(id),
  );

  await assignRoles(auth0Sub, rolesToAdd);
  await removeRoles(auth0Sub, rolesToRemove);

  return {
    roles: desiredRoleNames,
  };
}

export async function deleteAuth0UserBySub(auth0Sub: string): Promise<void> {
  for (let attempt = 0; attempt < deletionRetryCount; attempt += 1) {
    const response = await auth0ManagementRequest(
      `/users/${encodeAuth0Sub(auth0Sub)}`,
      {
        method: "DELETE",
      },
    );

    if (response.status === 404 || response.ok) return;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === deletionRetryCount - 1) {
      const text = await response.text();
      throw new Auth0ManagementError(
        `Failed to delete Auth0 user: ${text || response.statusText}`,
        response.status,
      );
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    const delay =
      Number.isFinite(retryAfter) && retryAfter >= 0
        ? Math.min(retryAfter * 1000, 5_000)
        : deletionRetryDelayMs * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export async function sendAuth0VerificationEmail(
  userId: string,
  clientId?: string,
): Promise<void> {
  const payload: Record<string, string> = {
    user_id: userId,
  };

  if (clientId?.trim()) {
    payload.client_id = clientId.trim();
  }

  const response = await auth0ManagementRequest("/jobs/verification-email", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Auth0ManagementError(
      `Failed to trigger Auth0 verification email: ${text || response.statusText}`,
      response.status,
    );
  }

  const body = (await response.json()) as Auth0VerificationJobResponse;
  if (!body.id) {
    throw new Auth0ManagementError(
      "Auth0 verification job response missing id",
      500,
    );
  }
}

export async function isAuth0UserEmailVerified(
  auth0Sub: string,
): Promise<boolean> {
  const response = await auth0ManagementRequest(
    `/users/${encodeAuth0Sub(auth0Sub)}?fields=email_verified&include_fields=true`,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Auth0ManagementError(
      `Failed to read Auth0 user verification status: ${text || response.statusText}`,
      response.status,
    );
  }

  const body = (await response.json()) as Auth0UserVerificationResponse;
  return body.email_verified === true;
}

/**
 * Check whether a user still exists in Auth0. Used to reconcile local DB
 * rows for social-connection users (e.g. Google) whose Auth0 identity was
 * removed directly through the Auth0 Dashboard/Management API — a path that
 * never invokes our custom database connection's delete.js script, since
 * that script is only called for users of the database connection itself.
 */
export async function auth0UserExists(auth0Sub: string): Promise<boolean> {
  const response = await auth0ManagementRequest(
    `/users/${encodeAuth0Sub(auth0Sub)}?fields=user_id&include_fields=true`,
  );

  if (response.status === 404) return false;
  if (!response.ok) {
    const text = await response.text();
    throw new Auth0ManagementError(
      `Failed to check Auth0 user existence: ${text || response.statusText}`,
      response.status,
    );
  }

  return true;
}

export async function isAuth0IdentityLinked(
  primarySub: string,
  secondarySub: string,
): Promise<boolean> {
  const response = await auth0ManagementRequest(
    `/users/${encodeAuth0Sub(primarySub)}?fields=identities&include_fields=true`,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Auth0ManagementError(
      `Failed to read Auth0 linked identities: ${text || response.statusText}`,
      response.status,
    );
  }

  const body = (await response.json()) as Auth0UserIdentitiesResponse;
  const separatorIndex = secondarySub.indexOf("|");
  if (separatorIndex <= 0 || separatorIndex === secondarySub.length - 1)
    return false;

  const provider = secondarySub.slice(0, separatorIndex);
  const userId = secondarySub.slice(separatorIndex + 1);
  return (
    body.identities?.some(
      (identity) =>
        identity.provider === provider && identity.user_id === userId,
    ) === true
  );
}
