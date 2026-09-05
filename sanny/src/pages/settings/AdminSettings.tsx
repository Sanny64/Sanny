import { useLanguage, translations } from "@sanny/i18n";
import { Button } from "../../../../shared/packages/ui/src/components/Button";
import { useEffect, useState } from "react";
import "./adminSettings.css";

type Identity = {
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

export default function AdminSettings() {
  const t = translations[useLanguage().language].shared.settings;
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userLookup, setUserLookup] = useState("");
  const [username, setUsername] = useState("");
  const [roles, setRoles] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const permissions = identity?.permissions ?? [];
  const isAdmin = identity?.roles.includes("admin") ?? false;
  const canReadUsers = isAdmin && permissions.includes("read:users");
  const canWriteUsers = isAdmin && permissions.includes("write:users");
  const canDeleteUsers = isAdmin && permissions.includes("delete:users");

  useEffect(() => {
    let cancelled = false;

    async function loadIdentity() {
      try {
        const currentIdentity = await request<Identity>("/api/v001/auth/me");
        if (!cancelled) setIdentity(currentIdentity);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : t.requestFailed,
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadIdentity();
    return () => {
      cancelled = true;
    };
  }, [t.requestFailed]);

  function selectUser(user: User) {
    setSelectedUser(user);
    setUsername(user.username ?? "");
    setRoles("");
    setMessage(null);
    setError(null);
  }

  async function loadUsers() {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      setUsers(await request<User[]>("/api/v001/users/list"));
      setMessage(t.usersLoaded);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : t.requestFailed,
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function loadUser() {
    const lookup = userLookup.trim();
    if (!lookup) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const path = /^\d+$/.test(lookup)
        ? `/api/v001/users/${lookup}`
        : `/api/v001/users/lookup?email=${encodeURIComponent(lookup)}`;
      selectUser(await request<User>(path));
      setMessage(t.userLoaded);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : t.requestFailed,
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function updateUser() {
    if (!selectedUser) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const user = await request<User>(`/api/v001/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      setSelectedUser(user);
      setUsers((currentUsers) =>
        currentUsers.map((entry) => (entry.id === user.id ? user : entry)),
      );
      const requestedRoles = roles
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean);
      if (requestedRoles.length > 0) {
        const result = await request<{ roles: string[] }>(
          `/api/v001/users/${selectedUser.id}/roles`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles: requestedRoles }),
          },
        );
        setRoles(result.roles.join(", "));
      }
      setMessage(t.userUpdated);
    } catch (requestError) {
      if (isMfaAuthenticationRequired(requestError)) {
        window.location.href = `${apiUrl}/api/v001/auth?mfa=true&returnTo=%2Fadmin%2Fsettings`;
        return;
      }
      setError(
        requestError instanceof Error ? requestError.message : t.requestFailed,
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function deleteUser() {
    if (!selectedUser || !window.confirm(t.confirmDeleteUser)) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      await request<void>(`/api/v001/users/${selectedUser.id}`, {
        method: "DELETE",
      });
      setUsers((currentUsers) =>
        currentUsers.filter((entry) => entry.id !== selectedUser.id),
      );
      setSelectedUser(null);
      setMessage(t.userDeleted);
    } catch (requestError) {
      if (isMfaAuthenticationRequired(requestError)) {
        window.location.href = `${apiUrl}/api/v001/auth?mfa=true&returnTo=%2Fadmin%2Fsettings`;
        return;
      }
      setError(
        requestError instanceof Error ? requestError.message : t.requestFailed,
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function requestPasswordReset() {
    if (!selectedUser) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      await request<void>(`/api/v001/users/${selectedUser.id}/password-reset`, {
        method: "POST",
      });
      setMessage(t.passwordResetRequested);
    } catch (requestError) {
      if (isMfaAuthenticationRequired(requestError)) {
        window.location.href = `${apiUrl}/api/v001/auth?mfa=true&returnTo=%2Fadmin%2Fsettings`;
        return;
      }
      setError(
        requestError instanceof Error ? requestError.message : t.requestFailed,
      );
    } finally {
      setIsBusy(false);
    }
  }

  if (isLoading) return <div className="content">{t.loading}</div>;
  if (!isAdmin)
    return (
      <div className="content admin-settings">
        <h1>{t.adminSettingsTitle}</h1>
        <p>{t.adminAccessDenied}</p>
      </div>
    );

  return (
    <div className="content admin-settings">
      <h1>{t.adminSettingsTitle}</h1>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      <section className="admin-settings__section">
        <h2>{t.adminUsersTitle}</h2>
        <div className="admin-settings__lookup">
          <label className="admin-settings__field">
            <span>{t.userLookup}</span>
            <input
              value={userLookup}
              onChange={(event) => setUserLookup(event.target.value)}
              disabled={!canReadUsers || isBusy}
            />
          </label>
          <div className="admin-settings__actions">
            <Button
              type="button"
              onClick={() => void loadUser()}
              disabled={!canReadUsers || isBusy || !userLookup.trim()}
            >
              {t.loadUser}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadUsers()}
              disabled={!canReadUsers || isBusy}
            >
              {t.loadUsers}
            </Button>
          </div>
        </div>
        {users.length > 0 && (
          <ul className="admin-settings__users">
            {users.map((user) => (
              <li key={user.id}>
                <div>
                  <strong>{user.username ?? user.email}</strong>
                  <span>{user.email}</span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => selectUser(user)}
                  disabled={isBusy}
                >
                  {t.selectUser}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedUser && (
        <section className="admin-settings__section">
          <div className="admin-settings__selected-header">
            <div>
              <h2>{t.selectedUserTitle}</h2>
              <p>{selectedUser.email}</p>
            </div>
          </div>
          <div className="admin-settings__fields">
            <label className="admin-settings__field">
              <span>{t.username}</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={!canWriteUsers || isBusy}
              />
            </label>
            <label className="admin-settings__field">
              <span>{t.roles}</span>
              <input
                value={roles}
                onChange={(event) => setRoles(event.target.value)}
                disabled={!canWriteUsers || isBusy}
              />
            </label>
          </div>
          <div className="admin-settings__actions">
            <Button
              type="button"
              onClick={() => void updateUser()}
              disabled={!canWriteUsers || isBusy || !username.trim()}
            >
              {t.updateUser}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void requestPasswordReset()}
              disabled={!canWriteUsers || isBusy}
            >
              {t.resetPassword}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void deleteUser()}
              disabled={!canDeleteUsers || isBusy}
            >
              {t.deleteUser}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
