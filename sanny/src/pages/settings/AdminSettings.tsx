import { useLanguage, translations } from "@sanny/i18n";
import { Button, Checkbox, ButtonGroup } from "@sanny/ui";
import { useEffect, useState, useRef } from "react";
import { useBlocker } from "react-router-dom";
import "../../styles/adminSettings.css";

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
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userLookup, setUserLookup] = useState("");
  const [username, setUsername] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initialUserData, setInitialUserData] = useState<{ username: string; roles: string[] } | null>(null);
  const stateRef = useRef({ username, selectedRoles, initialUserData, selectedUser });

  const permissions = identity?.permissions ?? [];
  const isAdmin = identity?.roles.includes("admin") ?? false;
  const canReadUsers = isAdmin && permissions.includes("read:users");
  const canWriteUsers = isAdmin && permissions.includes("write:users");
  const canDeleteUsers = isAdmin && permissions.includes("delete:users");

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedUsers = users.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useBlocker(({ nextLocation, currentLocation }) => {
    if (nextLocation.pathname === currentLocation.pathname) {
      return false;
    }

    const shouldAllowNavigation = confirmNavigation();
    return !shouldAllowNavigation;
  });

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (selectedUser && initialUserData) {
        const isUsernameChanged = username.trim() !== initialUserData.username;
        const currentRolesSorted = [...selectedRoles].sort().join(",");
        const initialRolesSorted = [...initialUserData.roles].sort().join(",");
        const isRolesChanged = currentRolesSorted !== initialRolesSorted;

        if (isUsernameChanged || isRolesChanged) {
          event.preventDefault();
          return ""; 
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [selectedUser, initialUserData, username, selectedRoles]);
  
  useEffect(() => {
    stateRef.current = { username, selectedRoles, initialUserData, selectedUser };
  }, [username, selectedRoles, initialUserData, selectedUser]);

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

  useEffect(() => {
    let cancelled = false;

    async function loadAvailableRoles() {
      try {
        const data = await request<{ roles: string[] }>(
          "/api/v001/users/roles/available",
        );
        if (!cancelled) {
          setAvailableRoles(data?.roles ?? []);
        }
      } catch (requestError) {
        if (!cancelled) {
          console.error("Failed to load available roles", requestError);
          setAvailableRoles([]);
        }
      }
    }

    if (canReadUsers) {
      void loadAvailableRoles();
    }

    return () => {
      cancelled = true;
    };
  }, [canReadUsers]);

  function selectUser(user: User) {
    setSelectedUser(user);
    setUsername(user.username ?? "");
    setSelectedRoles([]);
    setMessage(null);
    setError(null);
    loadUserRoles(user.id, user.username ?? "");
  }

  async function loadUserRoles(userId: number, currentUsername: string) {
    try {
      const data = await request<{ roles: string[] }>(
        `/api/v001/users/${userId}/roles`,
      );
      const roles = data?.roles ?? [];
      setSelectedRoles(roles);
      setInitialUserData({ username: currentUsername, roles: roles });
    } catch (err) {
      console.error("Failed to load user roles:", err);
      setSelectedRoles([]);
      setInitialUserData({ username: currentUsername, roles: [] });
    }
  }

  function confirmNavigation() {
    const { selectedUser, initialUserData, username, selectedRoles } = stateRef.current;

    if (selectedUser && initialUserData) {
      const isUsernameChanged = username.trim() !== initialUserData.username;
      const currentRolesSorted = [...selectedRoles].sort().join(",");
      const initialRolesSorted = [...initialUserData.roles].sort().join(",");
      const isRolesChanged = currentRolesSorted !== initialRolesSorted;

      if (isUsernameChanged || isRolesChanged) {
        return window.confirm("Sie haben ungespeicherte Änderungen. Möchten Sie diese wirklich verwerfen?");
      }
    }
    return true;
  }


  async function loadUsers() {
    if (!confirmNavigation()) return;

    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      let allUsers = await request<User[]>("/api/v001/users/list");
      
      if (import.meta.env.DEV) {
        const mockUsers: User[] = Array.from({ length: 25 }, (_, index) => ({
          id: 999000 + index,
          email: `mock.user.${index + 1}@example.com`,
          username: `MockUser_${index + 1}`
        }));
        allUsers = [...allUsers, ...mockUsers];
      }

      setUsers(allUsers);
      setCurrentPage(1);
      setSelectedUser(null);
      setInitialUserData(null);
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
    if (!confirmNavigation()) return;
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
      const updatedUsername = username.trim();
      const user = await request<User>(`/api/v001/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: updatedUsername }),
      });
      setSelectedUser(user);
      setUsers((currentUsers) =>
        currentUsers.map((entry) => (entry.id === user.id ? user : entry)),
      );

      let finalRoles = selectedRoles;
      if (selectedRoles.length > 0) {
        const result = await request<{ roles: string[] }>(
          `/api/v001/users/${selectedUser.id}/roles`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles: selectedRoles }),
          },
        );
        finalRoles = result.roles;
        setSelectedRoles(finalRoles);
      }
      setInitialUserData({ username: updatedUsername, roles: finalRoles });
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
      
      setUsers((currentUsers) => {
        const updatedUsers = currentUsers.filter((entry) => entry.id !== selectedUser.id);
        const newTotalPages = Math.ceil(updatedUsers.length / ITEMS_PER_PAGE);
        if (currentPage > newTotalPages && newTotalPages > 0) {
          setCurrentPage(newTotalPages);
        }
        return updatedUsers;
      });
      
      setSelectedUser(null);
      setInitialUserData(null); // Zustand leeren
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
        <h1>{t.adminAccessDenied}</h1>
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
          <ButtonGroup>
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
          </ButtonGroup>
        </div>
      </div>
      {users.length > 0 && (
        <>
          <ul className="admin-settings__users">
            {paginatedUsers.map((user) => (
              <li key={user.id}>
                <div>
                  <strong>{user.username ?? user.email}</strong>
                  <span>{user.email}</span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    // ZUERST prüfen, ob die Navigation erlaubt ist!
                    if (confirmNavigation()) {
                      selectUser(user);
                    }
                  }}
                  disabled={isBusy}
                >
                  {t.selectUser}
                </Button>
              </li>
            ))}
          </ul>
          
          {totalPages > 1 && (
            <div className="admin-settings__pagination" style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1 || isBusy}
              >
                Zurück
              </Button>
              <span>
                Seite {currentPage} von {totalPages}
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || isBusy}
              >
                Weiter
              </Button>
            </div>
          )}
        </>
      )}
    </section>
    {selectedUser && (
      <section className="admin-settings__section">
        <div className="admin-settings__selected-header">
            <h2>{t.selectedUserTitle}</h2>
            <p>{selectedUser.email}</p>
        </div>
        
        <div className="admin-settings__fields">
          <div className="admin-settings__left-column">
            <label className="admin-settings__field">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{t.username}</span>
                {initialUserData && username.trim() !== initialUserData.username && (
                  <span className="admin-settings__modified-indicator">* geändert</span>
                )}
              </div>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={!canWriteUsers || isBusy}
              />
            </label>

            <div className="admin-settings__actions">
              <ButtonGroup
                className="admin-settings__user-actions">
                <Button
                  type="button"
                  className={
                    selectedUser && initialUserData && (
                      username.trim() !== initialUserData.username ||
                      [...selectedRoles].sort().join(",") !== [...initialUserData.roles].sort().join(",")
                    ) ? "admin-settings__btn--unsaved" : ""
                  }
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
                  variant="destructive"
                  onClick={() => void deleteUser()}
                  disabled={!canDeleteUsers || isBusy}
                >
                  {t.deleteUser}
                </Button>
            </ButtonGroup>
            </div>
          </div>
          <div className="admin-settings__field">

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '21px' }}>
            <span>{t.roles}</span>
          </div>
          <fieldset style={{ marginTop: '6px', height: '100%' }}>
            <div className="admin-settings__roles">
              {availableRoles.map((role) => {
                const wasInitiallyChecked = initialUserData?.roles.includes(role) ?? false;
                const isCurrentlyChecked = selectedRoles.includes(role);
                const isRoleModified = wasInitiallyChecked !== isCurrentlyChecked;

                return (
                  <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Checkbox
                      label={role}
                      checked={isCurrentlyChecked}
                      onChange={(e) => {
                        if (e.currentTarget.checked) {
                          setSelectedRoles([...selectedRoles, role]);
                        } else {
                          setSelectedRoles(selectedRoles.filter((r) => r !== role));
                        }
                      }}
                      disabled={!canWriteUsers || isBusy}
                      containerClassName="admin-settings__role-item"
                    />
                    {isRoleModified && (
                      <span className="admin-settings__modified-indicator">* geändert</span>
                    )}
                  </div>
                );
              })}
              {availableRoles.length === 0 && (
                <p className="admin-settings__no-roles">No roles available</p>
              )}
            </div>
          </fieldset>
        </div>
      </div>
      </section>
    )}
  </div>
  );
}
