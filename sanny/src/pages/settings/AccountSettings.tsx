import { useLanguage, translations } from "@sanny/i18n";
import { Button } from "../../../../shared/packages/ui/src/components/Button";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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

type RequestError = Error & { status?: number };

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
    try {
      const body = (await response.json()) as { message?: string };
      message = body.message ?? message;
    } catch {
      // Keep the status-based message for empty responses.
    }
    const error = new Error(message) as RequestError;
    error.status = response.status;
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

export default function AccountSettings() {
  const t = translations[useLanguage().language];
  const navigate = useNavigate();
  const requestFailedMessage = t.shared.settings.requestFailed;
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          setError(
            loadError instanceof Error
              ? loadError.message
              : requestFailedMessage,
          );
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

  async function testAccountEndpoints() {
    setIsBusy(true);
    setError(null);
    setMessage(null);
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
      setMessage(t.shared.settings.accountTested);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : requestFailedMessage,
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function createAccount() {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const createdUser = await request<User>("/api/v001/users/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setUser(createdUser);
      setUsername(createdUser.username ?? "");
      setMessage(t.shared.settings.accountCreated);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t.shared.settings.requestFailed,
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function updateAccount() {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const updatedUser = await request<User>("/api/v001/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      setUser(updatedUser);
      setUsername(updatedUser.username ?? "");
      setMessage(t.shared.settings.accountUpdated);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t.shared.settings.requestFailed,
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteAccount() {
    if (!window.confirm(t.shared.settings.confirmDeleteAccount)) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      await request<void>("/api/v001/users/me", { method: "DELETE" });
      setUser(null);
      setMessage(t.shared.settings.accountDeleted);
    } catch (requestError) {
      if (isMfaAuthenticationRequired(requestError)) {
        window.location.href = `${apiUrl}/api/v001/auth?mfa=true&returnTo=%2Fsettings`;
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : t.shared.settings.requestFailed,
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function requestPasswordReset() {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      await request<void>("/api/v001/users/me/password-reset", {
        method: "POST",
      });
      setMessage(t.shared.settings.passwordResetRequested);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t.shared.settings.requestFailed,
      );
    } finally {
      setIsBusy(false);
    }
  }

  if (isLoading)
    return <div className="content">{t.shared.settings.loading}</div>;

  return (
    <div className="content">
      <h1>{t.shared.settings.title}</h1>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

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
            <Button
              type="button"
              variant="secondary"
              onClick={() => void requestPasswordReset()}
              disabled={isBusy}
            >
              {t.shared.settings.resetPassword}
            </Button>
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
    </div>
  );
}
