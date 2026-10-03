import { useLanguage, translations } from "@sanny/i18n";
import { Button } from "../../../../shared/packages/ui/src/components/Button";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  beginReauthentication,
  takePendingActionCredentials,
  type PendingAction,
} from "../../utils/reauthentication";
import {
  Settings as AppearanceSettings,
  showErrorToast,
  showToast,
} from "@sanny/ui";

type Identity = {
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
};

type User = {
  id: number;
  email: string;
  username: string | null;
};

type RequestError = Error & {
  status?: number;
  resumeToken?: string;
  emailOtpRequired?: boolean;
};

const apiUrl = import.meta.env.DEV
  ? import.meta.env.VITE_DEV_API_URL
  : import.meta.env.VITE_PROD_API_URL;

function getCsrfToken() {
  return document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("__Host-sanny_csrf="))
    ?.split("=")[1];
}

async function request<T>(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (method !== "GET") {
    headers.set("x-csrf-token", getCsrfToken() ?? "");
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let responseBody: {
      message?: string;
      resumeToken?: string;
      emailOtpRequired?: boolean;
    } = {};
    try {
      responseBody = (await response.json()) as typeof responseBody;
      message = responseBody.message ?? message;
    } catch {
      // Keep the status-based message for empty responses.
    }
    const error = new Error(message) as RequestError;
    error.status = response.status;
    error.resumeToken = responseBody.resumeToken;
    error.emailOtpRequired = responseBody.emailOtpRequired;
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function isMfaAuthenticationRequired(error: unknown) {
  return (
    error instanceof Error &&
    (error as RequestError).status === 401 &&
    error.message.includes("MFA authentication required")
  );
}

function isEmailOtpAuthenticationRequired(error: unknown) {
  return (
    error instanceof Error &&
    (error as RequestError).status === 401 &&
    (error as RequestError).emailOtpRequired === true
  );
}

function replayRequest(action: PendingAction) {
  return request(action.path, {
    method: action.method,
    ...(action.body !== null && action.body !== undefined
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action.body),
        }
      : {}),
  });
}

export default function AccountSettings() {
  const t = translations[useLanguage().language];
  const navigate = useNavigate();
  const requestFailedMessage = t.shared.notifications.requestFailed;
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const resumeStartedRef = useRef(false);

  const permissions = identity?.permissions ?? [];
  const roles = identity?.roles ?? [];
  const canUpdateSelf = permissions.includes("update:me");
  const canDeleteSelf = permissions.includes("delete:me");
  const canManageUsers =
    roles.includes("admin") && permissions.includes("read:users");

  useEffect(() => {
    let cancelled = false;

    async function loadAccount() {
      try {
        const currentIdentity = await request<Identity>("/api/v001/auth/me");
        if (!cancelled) {
          setIdentity(currentIdentity);
        }
        try {
          const currentUser = await request<User>("/api/v001/users/me");
          if (!cancelled) {
            setUser(currentUser);
            setUsername(currentUser.username ?? "");
          }
        } catch (requestError) {
          if ((requestError as RequestError).status !== 404) throw requestError;
          if (!cancelled) setUser(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          showErrorToast(loadError, requestFailedMessage);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, [requestFailedMessage]);

  useEffect(() => {
    if (resumeStartedRef.current) return;
    const credentials = takePendingActionCredentials();
    if (!credentials) return;
    resumeStartedRef.current = true;
    const pendingCredentials = credentials;

    async function resumePendingAction() {
      setIsBusy(true);
      try {
        const action = await request<PendingAction>(
          "/api/v001/auth/resume-action",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              resumeToken: pendingCredentials.resumeToken,
              factor: pendingCredentials.factor,
            }),
          },
        );
        await replayRequest(action);
        if (action.method === "DELETE") {
          setUser(null);
          setUsername("");
          showToast(t.shared.notifications.accountDeleted, { kind: "info" });
        } else if (action.path.endsWith("/me/password-reset")) {
          showToast(t.shared.notifications.passwordResetRequested, {
            kind: "info",
          });
        }
      } catch (resumeError) {
        showErrorToast(resumeError, requestFailedMessage);
      } finally {
        setIsBusy(false);
      }
    }

    void resumePendingAction();
  }, [
    requestFailedMessage,
    t.shared.notifications.accountDeleted,
    t.shared.notifications.passwordResetRequested,
  ]);

  async function testAccountEndpoints() {
    setIsBusy(true);
    try {
      const currentIdentity = await request<Identity>("/api/v001/auth/me");
      setIdentity(currentIdentity);
      try {
        const currentUser = await request<User>("/api/v001/users/me");
        setUser(currentUser);
        setUsername(currentUser.username ?? "");
      } catch (requestError) {
        if ((requestError as RequestError).status !== 404) throw requestError;
        setUser(null);
        setUsername("");
      }
      showToast(t.shared.notifications.accountTested, { kind: "info" });
    } catch (requestError) {
      showErrorToast(requestError, requestFailedMessage);
    } finally {
      setIsBusy(false);
    }
  }

  async function createAccount() {
    setIsBusy(true);
    try {
      const createdUser = await request<User>("/api/v001/users/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setUser(createdUser);
      setUsername(createdUser.username ?? "");
      showToast(t.shared.notifications.accountCreated, { kind: "info" });
    } catch (requestError) {
      showErrorToast(requestError, requestFailedMessage);
    } finally {
      setIsBusy(false);
    }
  }

  async function updateAccount() {
    setIsBusy(true);
    try {
      const updatedUser = await request<User>("/api/v001/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      setUser(updatedUser);
      setUsername(updatedUser.username ?? "");
      showToast(t.shared.notifications.accountUpdated, { kind: "info" });
    } catch (requestError) {
      showErrorToast(requestError, requestFailedMessage);
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteAccount() {
    if (!window.confirm(t.shared.settings.confirmDeleteAccount)) return;
    setIsBusy(true);
    try {
      await request<void>("/api/v001/users/me", { method: "DELETE" });
      setUser(null);
      showToast(t.shared.notifications.accountDeleted, { kind: "info" });
    } catch (requestError) {
      if (isMfaAuthenticationRequired(requestError)) {
        beginReauthentication(
          apiUrl,
          "mfa",
          (requestError as RequestError).resumeToken,
        );
        return;
      }
      showErrorToast(requestError, requestFailedMessage);
    } finally {
      setIsBusy(false);
    }
  }

  async function requestPasswordReset() {
    setIsBusy(true);
    try {
      await request<void>("/api/v001/users/me/password-reset", {
        method: "POST",
      });
      showToast(t.shared.notifications.passwordResetRequested, {
        kind: "info",
      });
    } catch (requestError) {
      if (isEmailOtpAuthenticationRequired(requestError)) {
        beginReauthentication(
          apiUrl,
          "email",
          (requestError as RequestError).resumeToken,
        );
        return;
      }
      showErrorToast(requestError, requestFailedMessage);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="content">
      <h1>{t.shared.settings.title}</h1>
      <AppearanceSettings />

      {isLoading ? (
        <p>{t.shared.settings.loading}</p>
      ) : (
        <>
          <section>
            <h2>{t.shared.settings.testTitle}</h2>
            <Button
              type="button"
              onClick={() => void testAccountEndpoints()}
              disabled={isBusy}
            >
              {t.shared.settings.testAccountEndpoints}
            </Button>
            {canManageUsers && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate("/admin/settings")}
                disabled={isBusy}
              >
                {t.shared.settings.openAdminSettings}
              </Button>
            )}
          </section>

          {!user ? (
            <section>
              <h2>{t.shared.settings.accountTitle}</h2>
              <p>{t.shared.settings.noLocalAccount}</p>
              <Button
                type="button"
                onClick={() => void createAccount()}
                disabled={isBusy}
              >
                {t.shared.settings.createAccount}
              </Button>
            </section>
          ) : (
            <section>
              <h2>{t.shared.settings.accountTitle}</h2>
              <p>{user.email}</p>
              <label>
                {t.shared.settings.username}
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={!canUpdateSelf || isBusy}
                />
              </label>
              <div className="btn-group btn-group--horizontal">
                {canUpdateSelf && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void requestPasswordReset()}
                    disabled={isBusy}
                  >
                    {t.shared.settings.resetPassword}
                  </Button>
                )}
                {canUpdateSelf && (
                  <Button
                    type="button"
                    onClick={() => void updateAccount()}
                    disabled={isBusy || !username.trim()}
                  >
                    {t.shared.settings.updateAccount}
                  </Button>
                )}
                {canDeleteSelf && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void deleteAccount()}
                    disabled={isBusy}
                  >
                    {t.shared.settings.deleteAccount}
                  </Button>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
