export const proofResumeKey = "sanny-account-link-proof-resume";

export type ProofResume = { state: string; expiresAt: number };

export function parseProofResume(
  raw: string | null,
  now = Date.now(),
): ProofResume | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    !value ||
    typeof value !== "object" ||
    !("state" in value) ||
    typeof value.state !== "string" ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(value.state) ||
    !("expiresAt" in value) ||
    typeof value.expiresAt !== "number" ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt <= now
  ) {
    return null;
  }
  return { state: value.state, expiresAt: value.expiresAt };
}

export function getProofStartUrl(apiUrl: string, state: string): string {
  const url = new URL("/api/v001/auth/account-link-proof/start", apiUrl);
  url.searchParams.set("state", state);
  return url.toString();
}

export function prepareProofResume(
  apiUrl: string,
  hash: string,
  getStorage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">,
): { url: string | null; error: string | null } {
  try {
    const storage = getStorage();
    const params = new URLSearchParams(hash.slice(1));
    const incomingState = params.get("state");
    const stored = storage.getItem(proofResumeKey);
    if (!incomingState && !stored) {
      return {
        url: new URL("/api/v001/auth", apiUrl).toString(),
        error: null,
      };
    }
    const raw = incomingState
      ? JSON.stringify({
          state: incomingState,
          expiresAt: Number(params.get("expiresAt")),
        })
      : stored;
    const pending = parseProofResume(raw);
    if (!pending) {
      storage.removeItem(proofResumeKey);
      return {
        url: null,
        error:
          "This account verification has expired or is unavailable. Return to the linking window and restart login.",
      };
    }
    storage.setItem(proofResumeKey, JSON.stringify(pending));
    return { url: getProofStartUrl(apiUrl, pending.state), error: null };
  } catch {
    return {
      url: null,
      error:
        "Account verification could not be resumed. Allow browser storage and restart verification from the linking window.",
    };
  }
}
