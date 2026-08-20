type Auth0TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type Auth0Role = {
  id: string;
  name: string;
};

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
    throw new Auth0ManagementError(`${name} environment variable must be set`, 500);
  }
  return value;
}

function getManagementConfig() {
  const domain = getRequiredEnv("AUTH0_DOMAIN");
  const clientId = getRequiredEnv("AUTH0_M2M_CLIENT_ID");
  const clientSecret = getRequiredEnv("AUTH0_M2M_CLIENT_SECRET");
  const audience =
    process.env.AUTH0_MANAGEMENT_AUDIENCE?.trim() || `https://${domain}/api/v2/`;

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
    throw new Auth0ManagementError("Auth0 Management API token response missing access_token", 500);
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
  const response = await auth0ManagementRequest(`/users/${encodeAuth0Sub(auth0Sub)}/roles`);

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

  const response = await auth0ManagementRequest(`/users/${encodeAuth0Sub(auth0Sub)}/roles`, {
    method: "POST",
    body: JSON.stringify({ roles: roleIds }),
  });

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

  const response = await auth0ManagementRequest(`/users/${encodeAuth0Sub(auth0Sub)}/roles`, {
    method: "DELETE",
    body: JSON.stringify({ roles: roleIds }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Auth0ManagementError(
      `Failed to remove Auth0 roles: ${text || response.statusText}`,
      response.status,
    );
  }
}

export async function syncAuth0UserRolesByName(auth0Sub: string, requestedRoleNames: string[]) {
  const desiredRoleNames = [...new Set(requestedRoleNames.map((role) => role.trim()).filter(Boolean))];
  const [allRoles, currentRoles] = await Promise.all([getAllRoles(), getUserRoles(auth0Sub)]);

  const roleByName = new Map(allRoles.map((role) => [role.name, role]));
  const missingRoles = desiredRoleNames.filter((roleName) => !roleByName.has(roleName));

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

  const rolesToAdd = desiredRoleIds.filter((id) => !currentRoleIds.includes(id));
  const rolesToRemove = currentRoleIds.filter((id) => !desiredRoleIds.includes(id));

  await assignRoles(auth0Sub, rolesToAdd);
  await removeRoles(auth0Sub, rolesToRemove);

  return {
    roles: desiredRoleNames,
  };
}

export async function deleteAuth0UserBySub(auth0Sub: string): Promise<void> {
  const response = await auth0ManagementRequest(`/users/${encodeAuth0Sub(auth0Sub)}`, {
    method: "DELETE",
  });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Auth0ManagementError(
      `Failed to delete Auth0 user: ${text || response.statusText}`,
      response.status,
    );
  }
}