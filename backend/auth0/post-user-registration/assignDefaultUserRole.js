/**
 * Assign the reviewed default role to each newly registered database user.
 *
 * Required Action secrets: AUTH0_DOMAIN, AUTH0_M2M_CLIENT_ID,
 * AUTH0_M2M_CLIENT_SECRET, AUTH0_MGMT_AUDIENCE, and AUTH0_DEFAULT_ROLE_ID.
 * 
 * @param {object} event - The event object containing user and secrets.
 * @param {string} name - The name of the Action secret to retrieve.
 */
function getActionSecret(event, name) {
  const value = event.secrets[name];
  if (!value) throw new Error(`${name} Action secret must be set`);
  return value;
}

async function fetchManagementToken(event) {
  const domain = getActionSecret(event, "AUTH0_DOMAIN");
  const response = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: getActionSecret(event, "AUTH0_M2M_CLIENT_ID"),
      client_secret: getActionSecret(event, "AUTH0_M2M_CLIENT_SECRET"),
      audience: getActionSecret(event, "AUTH0_MGMT_AUDIENCE"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Management token request failed (${response.status})`);
  }

  const payload = /** @type {{ access_token?: string }} */ (
    await response.json()
  );
  if (!payload.access_token) {
    throw new Error("Management token response missing access token");
  }
  return payload.access_token;
}

exports.onExecutePostUserRegistration = async (event) => {
  const userId = event.user.user_id;
  if (!userId) throw new Error("Registered user is missing user_id");

  const domain = getActionSecret(event, "AUTH0_DOMAIN");
  const accessToken = await fetchManagementToken(event);
  const response = await fetch(
    `https://${domain}/api/v2/users/${encodeURIComponent(userId)}/roles`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
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
};
