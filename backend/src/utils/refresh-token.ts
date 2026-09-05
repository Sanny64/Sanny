export function buildAuthorizationScope() {
  return ["openid", "profile", "email", "offline_access"].join(" ");
}

export function buildRefreshTokenRequest({
  clientId,
  clientSecret,
  refreshToken,
  audience,
  callbackUrl,
}: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  audience: string;
  callbackUrl: string;
}) {
  return {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    audience,
    redirect_uri: callbackUrl,
  };
}

export function issueRefreshTokenResponse({
  accessToken,
  refreshToken,
  expiresIn,
}: {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}) {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
  };
}
