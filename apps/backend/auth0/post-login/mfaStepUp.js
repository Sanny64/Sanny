/**
 * Challenge enrolled MFA factors only when the backend explicitly requests
 * step-up authentication through OIDC acr_values.
 *
 * @param {Object} event - The event object.
 * @param {Object} api - The API object.
 */
exports.onExecutePostLogin = async (event, api) => {
  const requestedAcrValues = event.transaction?.acr_values ?? [];
  if (requestedAcrValues.includes(event.secrets.EMAIL_MFA_ACR)) {
    api.authentication.challengeWith({ type: 'email' });
    return;
  }

  if (!requestedAcrValues.includes(event.secrets.MFA_ACR)) return;

  api.multifactor.enable('any', { allowRememberBrowser: false });
};

// This script is a mirror of it's original counterpart used within the Auth0 platform. It is not used within this backend and only provided as context.
