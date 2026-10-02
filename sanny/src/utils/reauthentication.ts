const pendingActionStorageKey = "sanny:pending-action";

export type AuthenticationFactor = "mfa" | "email";

export type PendingAction = {
  method: string;
  path: string;
  body: unknown;
};

export type PendingActionCredentials = {
  resumeToken: string;
  factor: AuthenticationFactor;
};

export function beginReauthentication(
  apiUrl: string,
  factor: AuthenticationFactor,
  resumeToken?: string,
) {
  if (resumeToken) {
    window.sessionStorage.setItem(
      pendingActionStorageKey,
      JSON.stringify({ resumeToken, factor }),
    );
  }

  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const authUrl = new URL("/api/v001/auth", apiUrl);
  authUrl.searchParams.set(factor === "email" ? "emailMfa" : "mfa", "true");
  authUrl.searchParams.set("returnTo", returnTo);
  window.location.assign(authUrl.toString());
}

export function takePendingActionCredentials() {
  const raw = window.sessionStorage.getItem(pendingActionStorageKey);
  window.sessionStorage.removeItem(pendingActionStorageKey);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as PendingActionCredentials;
    if (
      typeof saved.resumeToken !== "string" ||
      (saved.factor !== "mfa" && saved.factor !== "email")
    ) {
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}
