/**
 * Detects Auth0 accounts sharing a verified email and asks the user to
 * confirm linking, rather than merging them automatically.
 *
 * Flow:
 *   1. onExecutePostLogin detects candidate duplicate accounts.
 *   2. If found (and not already decided), redirect to a confirmation
 *      page you host. That page should require the user to re-authenticate
 *      into the *secondary* account before allowing "confirm" — this is
 *      the ownership proof Auth0's docs call for; this Action cannot
 *      enforce it on its own.
 *   3. Your confirmation page redirects back to
 *      https://{domain}/continue?state=...&decision=confirm|cancel
 *   4. onContinuePostLogin only links after confirmation. A cancelled
 *      first-login identity is deleted instead of becoming a second account.
 */

/**
 * @typedef {{ provider: string; providerUserId: string }} ParsedUserId
 * @typedef {{ provider?: string; user_id?: string }} IdentityShape
 * @typedef {{
 *   user_id: string;
 *   email_verified?: boolean;
 *   created_at?: string;
 *   identities?: IdentityShape[];
 * }} Auth0User
 * @typedef {{
 *   user: {
 *     user_id?: string;
 *     email?: string;
 *     email_verified?: boolean;
 *     app_metadata?: Record<string, any>;
 *   };
 *   stats?: { logins_count?: number };
 *   transaction?: { protocol?: string };
 *   request?: { query?: Record<string, string> };
 *   secrets: Record<string, string | undefined>;
 * }} PostLoginEvent
 * @typedef {{
 *   authentication?: { setPrimaryUser?: (userId: string) => void };
 *   redirect?: { sendUserTo: (url: string, opts?: { query?: Record<string, string> }) => void };
 *   idToken?: { setCustomClaim?: (key: string, value: boolean) => void };
 *   accessToken?: { setCustomClaim?: (key: string, value: boolean) => void };
 *   access?: { deny?: (reason: string, description: string) => void };
 * }} PostLoginApi
 */

const LINK_DECISION_METADATA_KEY = "pending_account_link";
const GOOGLE_PROVIDER = "google-oauth2";
const DATABASE_PROVIDER = "auth0";
// A "pending" decision is only recorded right before redirecting the user to
// the confirmation page. If that attempt is abandoned (closed tab, network
// error, or -- as happened here -- a bug in the confirmation UI) the flag
// would otherwise stay "pending" forever and permanently block re-detection
// on every future login. Only a durable "confirmed" (or explicit
// "cancelled") decision should suppress re-prompting indefinitely; a
// "pending" one expires after a short TTL so an interrupted attempt can be
// retried.
const PENDING_DECISION_TTL_MS = 5 * 60 * 1000;

/**
 * @param {PostLoginEvent} event
 * @param {string} name
 */
function getActionSecret(event, name) {
  const value = event.secrets[name];
  if (!value) throw new Error(`${name} Action secret must be set`);
  return value;
}

/**
 * @param {PostLoginEvent} event
 * @param {string} name
 */
function getEnvironmentSpecificActionSecret(event, name) {
  const environment = event.secrets.NODE_ENV;
  if (environment !== "development" && environment !== "production") {
    throw new Error("NODE_ENV must be exactly development or production");
  }
  const prefix = environment === "production" ? "PROD" : "DEV";
  const value = event.secrets[`${prefix}_${name}`];
  if (!value) throw new Error(`${prefix}_${name} Action secret must be set`);
  return value;
}

/**
 * @param {string | undefined} userId
 * @returns {ParsedUserId | null}
 */
function parseAuth0UserId(userId) {
  if (typeof userId !== "string") return null;
  const separatorIndex = userId.indexOf("|");
  if (separatorIndex <= 0 || separatorIndex === userId.length - 1) return null;
  return {
    provider: userId.slice(0, separatorIndex),
    providerUserId: userId.slice(separatorIndex + 1),
  };
}

/**
 * @param {PostLoginEvent} event
 * @returns {string[]}
 */
function getAllowedProviders(event) {
  const raw = getActionSecret(event, "ACCOUNT_LINK_ALLOWED_PROVIDERS");
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return ["auth0", "google-oauth2"];
}

/**
 * @param {Auth0User[]} users
 * @returns {Auth0User | undefined}
 */
function selectGooglePrimaryIdentity(users) {
  return users.find((candidate) => {
    const parsed = parseAuth0UserId(candidate.user_id);
    return parsed && parsed.provider === GOOGLE_PROVIDER;
  });
}

/**
 * @param {Auth0User} primaryUser
 * @param {ParsedUserId} secondaryParsedUserId
 * @returns {boolean}
 */
function identityAlreadyLinked(primaryUser, secondaryParsedUserId) {
  if (!Array.isArray(primaryUser.identities)) return false;
  return primaryUser.identities.some(
    (identity) =>
      identity &&
      identity.provider === secondaryParsedUserId.provider &&
      identity.user_id === secondaryParsedUserId.providerUserId,
  );
}

/**
 * @param {{ decision?: string; decidedAt?: string } | undefined} decision
 * @returns {boolean}
 */
function isDecisionStillBlocking(decision) {
  if (!decision || typeof decision !== "object") return false;
  if (decision.decision === "confirmed") return true;
  if (decision.decision !== "pending") return false;

  const decidedAt = Date.parse(decision.decidedAt || "");
  if (!Number.isFinite(decidedAt)) return false;
  return Date.now() - decidedAt < PENDING_DECISION_TTL_MS;
}

/**
 * @param {PostLoginEvent} event
 * @returns {Promise<string | null>}
 */
async function fetchManagementToken(event) {
  const domain = getActionSecret(event, "AUTH0_DOMAIN");
  const clientId = getActionSecret(event, "AUTH0_M2M_CLIENT_ID");
  const clientSecret = getActionSecret(event, "AUTH0_M2M_CLIENT_SECRET");
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
 * @param {string} email
 * @returns {Promise<Auth0User[]>}
 */
async function fetchUsersByEmail(event, managementToken, email) {
  const domain = getActionSecret(event, "AUTH0_DOMAIN");
  const encodedEmail = encodeURIComponent(email);
  const response = await fetch(
    `https://${domain}/api/v2/users-by-email?email=${encodedEmail}`,
    { headers: { authorization: `Bearer ${managementToken}` } },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`users-by-email failed (${response.status}): ${body}`);
  }
  const users = await response.json();
  return Array.isArray(users) ? /** @type {Auth0User[]} */ (users) : [];
}

/**
 * @param {PostLoginEvent} event
 * @param {string} managementToken
 * @param {string} primaryUserId
 * @param {string} secondaryUserId
 */
async function linkIdentity(
  event,
  managementToken,
  primaryUserId,
  secondaryUserId,
) {
  const domain = getActionSecret(event, "AUTH0_DOMAIN");
  const secondaryParsed = parseAuth0UserId(secondaryUserId);
  if (!secondaryParsed) {
    throw new Error(`Invalid secondary user id: ${secondaryUserId}`);
  }

  const response = await fetch(
    `https://${domain}/api/v2/users/${encodeURIComponent(primaryUserId)}/identities`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${managementToken}`,
      },
      body: JSON.stringify({
        provider: secondaryParsed.provider,
        user_id: secondaryParsed.providerUserId,
      }),
    },
  );

  if (response.status === 409) return;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Link request failed (${response.status}): ${body}`);
  }
}

/**
 * Record that this user was already offered a link decision, so we don't
 * re-prompt on every subsequent login regardless of outcome.
 * @param {PostLoginEvent} event
 * @param {string} managementToken
 * @param {string} userId
 * @param {"confirmed" | "pending" | "cancelled"} decision
 */
async function recordLinkDecision(event, managementToken, userId, decision) {
  const domain = getActionSecret(event, "AUTH0_DOMAIN");
  const response = await fetch(
    `https://${domain}/api/v2/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${managementToken}`,
      },
      body: JSON.stringify({
        app_metadata: {
          [LINK_DECISION_METADATA_KEY]: {
            decision,
            decidedAt: new Date().toISOString(),
          },
        },
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Recording link decision failed (${response.status}): ${body}`,
    );
  }
}

/**
 * @param {PostLoginEvent} event
 * @param {string} managementToken
 * @param {string} userId
 */
async function deleteUser(event, managementToken, userId) {
  const domain = getActionSecret(event, "AUTH0_DOMAIN");
  const response = await fetch(
    `https://${domain}/api/v2/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${managementToken}` },
    },
  );
  if (response.status !== 404 && !response.ok) {
    const body = await response.text();
    throw new Error(
      `Temporary account deletion failed (${response.status}): ${body}`,
    );
  }
}

/**
 * @param {string} event
 * @param {Record<string, any>} details
 */
function logLinkDetection(event, details) {
  const detailsString =
    details && typeof details === "object" ? JSON.stringify(details) : "";
  console.log(`post-login account link detection: ${event}`, {
    details: detailsString,
  });
}

/**
 * @param {PostLoginEvent} event
 * @param {PostLoginApi} api
 */
async function detectAndPromptForLinking(event, api) {
  const query = event.request && event.request.query ? event.request.query : {};
  if (query.link_proof === "true") {
    logLinkDetection("secondary_proof_login_passthrough");
    return;
  }

  const alreadyDecided =
    event.user.app_metadata &&
    event.user.app_metadata[LINK_DECISION_METADATA_KEY];
  if (isDecisionStillBlocking(alreadyDecided)) {
    return;
  }

  const managementToken = await fetchManagementToken(event);
  if (!managementToken) {
    logLinkDetection("no_management_token");
    return;
  }

  const allowedProviders = getAllowedProviders(event);
  const email = event.user.email;
  if (typeof email !== "string" || !email.trim()) {
    logLinkDetection("no_email");
    return;
  }
  const usersByEmail = await fetchUsersByEmail(event, managementToken, email);
  logLinkDetection("fetched_users_by_email", {
    userIds: usersByEmail.map((u) => u.user_id),
    emailVerifiedFlags: usersByEmail.map((u) => u.email_verified),
    allowedProviders,
  });

  /** @type {Auth0User[]} */
  const eligibleUsers = usersByEmail.filter((candidate) => {
    if (!candidate || typeof candidate.user_id !== "string") return false;
    if (candidate.email_verified !== true) return false;
    const parsed = parseAuth0UserId(candidate.user_id);
    return !!parsed && allowedProviders.includes(parsed.provider);
  });

  if (eligibleUsers.length < 2) {
    logLinkDetection("fewer_than_two_eligible_users", {
      eligibleUserIds: eligibleUsers.map((u) => u.user_id),
    });
    return;
  }

  const primaryUser = selectGooglePrimaryIdentity(eligibleUsers);
  if (!primaryUser) {
    logLinkDetection("no_google_primary_identity_found");
    return;
  }

  const secondaryUser = eligibleUsers.find((candidate) => {
    if (candidate.user_id === primaryUser.user_id) return false;
    const parsed = parseAuth0UserId(candidate.user_id);
    return (
      parsed &&
      parsed.provider === DATABASE_PROVIDER &&
      !identityAlreadyLinked(primaryUser, parsed)
    );
  });

  if (!secondaryUser) {
    logLinkDetection("no_unlinked_secondary_identity_found", {
      primaryUserId: primaryUser.user_id,
      primaryIdentities: primaryUser.identities,
    });
    return; // nothing unlinked left to offer
  }

  const temporaryUserId =
    event.stats && event.stats.logins_count === 1
      ? event.user.user_id
      : undefined;
  if (temporaryUserId) {
    await recordLinkDecision(
      event,
      managementToken,
      temporaryUserId,
      "pending",
    );
  }

  const environmentSpecificConfirmationUrl = getEnvironmentSpecificActionSecret(
    event,
    "ACCOUNT_LINK_CONFIRMATION_URL",
  );
  if (!api.redirect) return;

  api.redirect.sendUserTo(environmentSpecificConfirmationUrl, {
    query: {
      primaryUserId: primaryUser.user_id,
      secondaryUserId: secondaryUser.user_id,
      ...(temporaryUserId ? { temporaryUserId } : {}),
    },
  });
}

/**
 * @param {PostLoginEvent} event
 * @param {PostLoginApi} api
 */
async function handleLinkDecision(event, api) {
  const query = event.request && event.request.query ? event.request.query : {};
  const decision = query.decision;
  const primaryUserId = query.primaryUserId;
  const secondaryUserId = query.secondaryUserId;
  const temporaryUserId = query.temporaryUserId;
  const proof = query.proof;

  if (decision !== "confirm" && decision !== "cancel") return;
  const primaryParsed = parseAuth0UserId(primaryUserId);
  const secondaryParsed = parseAuth0UserId(secondaryUserId);
  if (
    !primaryParsed ||
    primaryParsed.provider !== GOOGLE_PROVIDER ||
    !secondaryParsed ||
    secondaryParsed.provider !== DATABASE_PROVIDER
  ) {
    throw new Error("Invalid canonical account-link identities");
  }

  const managementToken = await fetchManagementToken(event);
  if (!managementToken) return;

  if (decision === "cancel") {
    if (temporaryUserId && temporaryUserId === event.user.user_id) {
      await deleteUser(event, managementToken, temporaryUserId);
    } else {
      await recordLinkDecision(
        event,
        managementToken,
        primaryUserId,
        "cancelled",
      );
    }
    if (api.access && typeof api.access.deny === "function") {
      api.access.deny(
        "account_linking_cancelled",
        "Sign in with your existing account to continue.",
      );
    }
    return;
  }

  if (decision === "confirm") {
    if (
      !verifyAccountLinkProof(
        proof,
        primaryUserId,
        secondaryUserId,
        getActionSecret(event, "ACCOUNT_LINK_PROOF_SECRET"),
      )
    ) {
      throw new Error("Invalid account-link proof");
    }
    await linkIdentity(event, managementToken, primaryUserId, secondaryUserId);
    if (
      event.user.user_id !== primaryUserId &&
      api.authentication &&
      typeof api.authentication.setPrimaryUser === "function"
    ) {
      api.authentication.setPrimaryUser(primaryUserId);
    }

    /**
     * Record that this user was already offered a link decision, so we don't
     * re-prompt on every subsequent login regardless of outcome.
     * @param {string} proof
     * @param {string} primaryUserId
     * @param {string} secondaryUserId
     * @param {string} secret
     */
    function verifyAccountLinkProof(
      proof,
      primaryUserId,
      secondaryUserId,
      secret,
    ) {
      if (typeof proof !== "string") return false;
      const parts = proof.split(".");
      if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
      const crypto = require("crypto");
      const expected = crypto
        .createHmac("sha256", secret)
        .update(parts[0])
        .digest("base64url");
      const expectedBuffer = Buffer.from(expected);
      const actualBuffer = Buffer.from(parts[1]);
      if (
        expectedBuffer.length !== actualBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
      ) {
        return false;
      }
      try {
        const payload = JSON.parse(
          Buffer.from(parts[0], "base64url").toString("utf8"),
        );
        return (
          payload.primaryUserId === primaryUserId &&
          payload.secondaryUserId === secondaryUserId &&
          Number.isSafeInteger(payload.expiresAt) &&
          payload.expiresAt > Date.now()
        );
      } catch {
        return false;
      }
    }
    await recordLinkDecision(
      event,
      managementToken,
      primaryUserId,
      "confirmed",
    );
  }
}

/**
 * @param {PostLoginEvent} event
 * @param {PostLoginApi} api
 */
exports.onExecutePostLogin = async (event, api) => {
  try {
    await detectAndPromptForLinking(event, api);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log("post-login account link detection skipped", {
      message: errorMessage,
      userId: event.user && event.user.user_id ? event.user.user_id : null,
    });
  }
};

/**
 * @param {PostLoginEvent} event
 * @param {PostLoginApi} api
 */
exports.onContinuePostLogin = async (event, api) => {
  try {
    await handleLinkDecision(event, api);

    if (event.user.email_verified === true) {
      if (api.idToken && typeof api.idToken.setCustomClaim === "function") {
        api.idToken.setCustomClaim("email_verified", true);
      }
      if (
        api.accessToken &&
        typeof api.accessToken.setCustomClaim === "function"
      ) {
        api.accessToken.setCustomClaim("email_verified", true);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log("post-login account link decision failed", {
      message: errorMessage,
      userId: event.user && event.user.user_id ? event.user.user_id : null,
    });
    if (api.access && typeof api.access.deny === "function") {
      api.access.deny(
        "account_linking_failed",
        "The accounts could not be linked securely. Please try again.",
      );
    }
  }
};

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
