/**
 * Challenge enrolled MFA factors only when the backend explicitly requests
 * step-up authentication through the standard OIDC acr_values parameter.
 *
 * @param {Object} event - The event object.
 * @param {Object} api - The API object.
 */
exports.onExecutePostLogin = async (event, api) => {
  const requestedAcrValues = event.transaction?.acr_values ?? [];
  if (!requestedAcrValues.includes(event.secrets.MFA_ACR)) return;

  api.multifactor.enable("any", { allowRememberBrowser: false });
};
