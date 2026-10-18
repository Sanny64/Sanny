/**
 * Handler that sets custom role/profile claims during Post Login.
 * Falls back to checking user_metadata for roles if authorization roles are empty.
 *
 * @param {Event} event - Details about the user and the context in which they are logging in.
 * @param {String} name - Name of the action secret to retrieve.
 */
function getActionSecret(event, name) {
  // comment: Parameter 'name' implicitly has an 'any' type, but a better type may be inferred from usage.
  const value = event.secrets[name];
  if (!value) throw new Error(`${name} Action secret must be set`);
  return value;
}

async function assignDefaultRole(event) {
  const domain = getActionSecret(event, "AUTH0_DOMAIN");
  const tokenResponse = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: getActionSecret(event, "AUTH0_M2M_CLIENT_ID"),
      client_secret: getActionSecret(event, "AUTH0_M2M_CLIENT_SECRET"),
      audience: getActionSecret(event, "AUTH0_MGMT_AUDIENCE"),
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `Management token request failed (${tokenResponse.status})`,
    );
  }

  const tokenPayload = await tokenResponse.json();
  if (!tokenPayload || !tokenPayload.access_token) {
    throw new Error("Management token response missing access token");
  }

  const userId = event.user.user_id;
  if (!userId) throw new Error("Login user is missing user_id");

  const response = await fetch(
    `https://${domain}/api/v2/users/${encodeURIComponent(userId)}/roles`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenPayload.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        roles: [getActionSecret(event, "AUTH0_DEFAULT_ROLE_ID")],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Default role assignment failed (${response.status})`);
  }
}

/**
 * @param {Event} event - Details about the user and the context in which they are logging in.
 * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
 */
exports.onExecutePostLogin = async (event, api) => {
  const namespace = getActionSecret(event, "AUTH0_CLAIM_NAMESPACE");

  // Get roles from authorization (assigned via Management API) or fallback to user_metadata
  const authorizationRoles = Array.isArray(event.authorization?.roles)
    ? event.authorization.roles
    : [];
  let roles = [...authorizationRoles];

  // Fallback: check user_metadata.roles if authorization.roles is empty
  if (roles.length === 0 && event.user.user_metadata?.roles) {
    const metadataRoles = event.user.user_metadata.roles;
    if (Array.isArray(metadataRoles)) {
      roles = [...metadataRoles];
    }
  }

  const isDatabaseConnection =
    event.connection && event.connection.strategy === "auth0";
  if (!isDatabaseConnection && !authorizationRoles.includes("user")) {
    await assignDefaultRole(event);
    if (!roles.includes("user")) roles.push("user");
  }

  api.accessToken.setCustomClaim(`${namespace}/roles`, roles);

  if (event.user.email) {
    api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);
  }

  const managedUsername = event.user.user_metadata?.username;
  const name = isDatabaseConnection
    ? (event.user.username ?? event.user.name ?? event.user.nickname)
    : (managedUsername ??
      event.user.name ??
      event.user.username ??
      event.user.nickname);
  if (name) {
    api.accessToken.setCustomClaim(`${namespace}/name`, name);
  }

  // Include email_verified claim in the access token
  if (typeof event.user.email_verified === "boolean") {
    api.accessToken.setCustomClaim(
      getActionSecret(event, "AUTH0_EMAIL_VERIFIED_CLAIM"),
      event.user.email_verified,
    );
  }
};

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
