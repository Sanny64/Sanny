/**
 * Handler that sets custom role/profile claims during Post Login.
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

/**
 * @param {Event} event - Details about the user and the context in which they are logging in.
 * @param {PostLoginAPI} api - Interface whose methods can be used to change the behavior of the login.
 */
exports.onExecutePostLogin = async (event, api) => {
  const namespace = getActionSecret(event, "AUTH0_CLAIM_NAMESPACE");
  api.accessToken.setCustomClaim(
    `${namespace}/roles`,
    event.authorization?.roles ?? [],
  );

  if (event.user.email) {
    api.accessToken.setCustomClaim(`${namespace}/email`, event.user.email);
  }

  const isDatabaseConnection =
    event.connection && event.connection.strategy === "auth0";
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
