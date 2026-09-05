/**
 * Post Login Action: Verify email addresses for new users on signup due to OTP signup requirements.
 * Also stamps email_verified claim onto tokens after confirmation.
 *
 * Required Action secrets:
 * - AUTH0_DOMAIN: the shared Auth0 tenant domain
 * - AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET:
 *   a Management API client with the "update:users" scope
 * - AUTH0_MGMT_AUDIENCE and AUTH0_EMAIL_VERIFIED_CLAIM
 */

/**
 * @typedef {{
 *   user: { user_id?: string; email_verified?: boolean };
 *   stats?: { logins_count?: number };
 *   connection?: { strategy?: string };
 *   secrets: Record<string, string | undefined>;
 * }} PostLoginEvent
 *
 * @typedef {{
 *   idToken?: { setCustomClaim?: (key: string, value: any) => void };
 *   accessToken?: { setCustomClaim?: (key: string, value: any) => void };
 * }} PostLoginApi
 */

/**
 * @param {PostLoginEvent} event
 * @param {String} name
 */
function getActionSecret(event, name) {
  // comment: Parameter 'event' and 'name' implicitly have an 'any' type, but a better type may be inferred from usage.
  const value = event.secrets[name];
  if (!value) throw new Error(`${name} Action secret must be set`);
  return value;
}

/**
 * @param {PostLoginEvent} event
 * @returns {Promise<string | null>}
 */
async function fetchManagementToken(event) {
  const domain = getActionSecret(event, "AUTH0_DOMAIN");
  const clientId = getActionSecret(event, "AUTH0_M2M_CLIENT_ID");
  const clientSecret = getActionSecret(event, "AUTH0_M2M_CLIENT_SECRET");

  // Use provided audience or construct from domain (default Auth0 Management API audience)
  const audience = getActionSecret(event, "AUTH0_MGMT_AUDIENCE");

  const response = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Management token request failed (${response.status}): ${body}`,
    );
  }

  const payload = /** @type {{ access_token?: string }} */ (
    await response.json()
  );
  if (!payload || !payload.access_token) {
    throw new Error("Management token response missing access token");
  }

  return payload.access_token;
}

/**
 * @param {PostLoginEvent} event
 * @param {string} managementToken
 * @param {string} userId
 */
async function setEmailVerified(event, managementToken, userId) {
  const domain = getActionSecret(event, "AUTH0_DOMAIN");

  const response = await fetch(
    `https://${domain}/api/v2/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${managementToken}`,
      },
      body: JSON.stringify({ email_verified: true }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Set email_verified failed (${response.status}): ${body}`);
  }
}

/**
 * @param {PostLoginEvent} event
 * @param {PostLoginApi} api
 */
exports.onExecutePostLogin = async (event, api) => {
  try {
    const isFirstLogin = event.stats && event.stats.logins_count === 1;
    const isDatabaseConnection =
      event.connection && event.connection.strategy === "auth0";
    const alreadyVerified = event.user.email_verified === true;

    if (!isFirstLogin || !isDatabaseConnection || alreadyVerified) {
      return;
    }

    const managementToken = await fetchManagementToken(event);
    if (!managementToken || !event.user.user_id) {
      return;
    }

    await setEmailVerified(event, managementToken, event.user.user_id);

    // After Management API call succeeds, stamp email_verified claim on tokens
    // so the user does not need to log in twice on sign up
    if (api.idToken && typeof api.idToken.setCustomClaim === "function") {
      api.idToken.setCustomClaim("email_verified", true);
    }
    if (
      api.accessToken &&
      typeof api.accessToken.setCustomClaim === "function"
    ) {
      api.accessToken.setCustomClaim(
        getActionSecret(event, "AUTH0_EMAIL_VERIFIED_CLAIM"),
        true,
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log("post-login set email_verified skipped", {
      message: errorMessage,
      userId: event.user && event.user.user_id ? event.user.user_id : null,
    });
  }
};

// This script is a mirror of its original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
