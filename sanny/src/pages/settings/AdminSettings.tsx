import { useLanguage, translations } from "@sanny/i18n";
import { Button, Checkbox, ButtonGroup } from "@sanny/ui";
import { useEffect, useState, useRef } from "react";
import { useBlocker } from "react-router-dom";
import "../../styles/adminSettings.css";
import {
  beginReauthentication,
  takePendingActionCredentials,
  type PendingAction,
} from "../../utils/reauthentication";

type Identity = {
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
    let resumeToken: string | undefined;
    try {
      const body = (await response.json()) as {
        message?: string;
        resumeToken?: string;
      };
      message = body.message ?? message;
      resumeToken = body.resumeToken;
    } catch {
      // Keep the status-based message for empty responses.
    }
    const error = new Error(message) as RequestError;
    error.status = response.status;
    error.resumeToken = resumeToken;
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

function beginMfaIfRequired(error: unknown) {
  if (!isMfaAuthenticationRequired(error)) return false;
  beginReauthentication(apiUrl, "mfa", (error as RequestError).resumeToken);
  return true;
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
  const [initialUserData, setInitialUserData] = useState<{
    username: string;
    roles: string[];
  } | null>(null);
  const stateRef = useRef({
    username,
    selectedRoles,
    initialUserData,
    selectedUser,
  });
  const resumeStartedRef = useRef(false);

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
    stateRef.current = {
      username,
      selectedRoles,
      initialUserData,
      selectedUser,
    };
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

  async function selectUser(user: User) {
    const currentUsername = user.username ?? "";
    setIsBusy(true);
    setSelectedUser(user);
    setUsername(currentUsername);
    setSelectedRoles([]);
    setInitialUserData(null);
    setMessage(null);
    setError(null);
    try {
      const data = await request<{ roles: string[] }>(
        `/api/v001/users/${user.id}/roles`,
      );
      const roles = data?.roles ?? [];
      setSelectedRoles(roles);
      setInitialUserData({ username: currentUsername.trim(), roles });
      return true;
    } catch (requestError) {
      if (beginMfaIfRequired(requestError)) return false;
      setError(
        requestError instanceof Error ? requestError.message : t.requestFailed,
      );
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  function confirmNavigation() {
    const { selectedUser, initialUserData, username, selectedRoles } =
      stateRef.current;

    if (selectedUser && initialUserData) {
      const isUsernameChanged = username.trim() !== initialUserData.username;
      const currentRolesSorted = [...selectedRoles].sort().join(",");
      const initialRolesSorted = [...initialUserData.roles].sort().join(",");
      const isRolesChanged = currentRolesSorted !== initialRolesSorted;

      if (isUsernameChanged || isRolesChanged) {
        return window.confirm(
          "Sie haben ungespeicherte Änderungen. Möchten Sie diese wirklich verwerfen?",
        );
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
          username: `MockUser_${index + 1}`,
        }));
        allUsers = [...allUsers, ...mockUsers];
      }

      setUsers(allUsers);
      setCurrentPage(1);
      setSelectedUser(null);
      setInitialUserData(null);
      setMessage(t.usersLoaded);
    } catch (requestError) {
      if (beginMfaIfRequired(requestError)) return;
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
      if (await selectUser(await request<User>(path))) {
        setMessage(t.userLoaded);
      }
    } catch (requestError) {
      if (beginMfaIfRequired(requestError)) return;
      setError(
        requestError instanceof Error ? requestError.message : t.requestFailed,
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function updateUser() {
    if (!selectedUser || !initialUserData) return;
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
      const rolesChanged =
        [...selectedRoles].sort().join(",") !==
        [...initialUserData.roles].sort().join(",");
      if (rolesChanged) {
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
      if (beginMfaIfRequired(requestError)) return;
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
        const updatedUsers = currentUsers.filter(
          (entry) => entry.id !== selectedUser.id,
        );
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
      if (beginMfaIfRequired(requestError)) return;
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
      if (beginMfaIfRequired(requestError)) return;
      setError(
        requestError instanceof Error ? requestError.message : t.requestFailed,
      );
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    if (resumeStartedRef.current) return;
    const credentials = takePendingActionCredentials();
    if (!credentials) return;
    resumeStartedRef.current = true;

    async function resumePendingAction() {
      setIsBusy(true);
      try {
        const action = await request<PendingAction>(
          "/api/v001/auth/resume-action",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(credentials),
          },
        );
        const result = await replayRequest(action);
        const userId = action.path.match(
          /^\/api\/v001\/users\/(\d+)(?:\/|$)/,
        )?.[1];

        if (action.method === "DELETE" && userId) {
          const deletedUserId = Number(userId);
          setUsers((currentUsers) =>
            currentUsers.filter((entry) => entry.id !== deletedUserId),
          );
          setSelectedUser(null);
          setInitialUserData(null);
          setMessage(t.userDeleted);
        } else if (action.method === "GET" && action.path.endsWith("/list")) {
          setUsers(result as User[]);
          setCurrentPage(1);
          setMessage(t.usersLoaded);
        } else {
          let user: User | undefined;
          if (action.path.includes("/lookup?")) {
            user = result as User;
          } else if (userId) {
            user = await request<User>(`/api/v001/users/${userId}`);
          }
          if (user) {
            setUsers((currentUsers) => {
              const existing = currentUsers.some(
                (entry) => entry.id === user?.id,
              );
              return existing
                ? currentUsers.map((entry) =>
                    entry.id === user?.id ? user : entry,
                  )
                : [...currentUsers, user];
            });
            const roleData = await request<{ roles: string[] }>(
              `/api/v001/users/${user.id}/roles`,
            );
            const roles = roleData.roles ?? [];
            setSelectedUser(user);
            setUsername(user.username ?? "");
            setSelectedRoles(roles);
            setInitialUserData({
              username: (user.username ?? "").trim(),
              roles,
            });
          }

          if (action.path.endsWith("/password-reset")) {
            setMessage(t.passwordResetRequested);
          } else if (action.method !== "GET") {
            setMessage(t.userUpdated);
          } else if (user) {
            setMessage(t.userLoaded);
          }
        }
      } catch (resumeError) {
        if (beginMfaIfRequired(resumeError)) return;
        setError(
          resumeError instanceof Error ? resumeError.message : t.requestFailed,
        );
      } finally {
        setIsBusy(false);
      }
    }

    void resumePendingAction();
  }, [
    t.passwordResetRequested,
    t.requestFailed,
    t.userDeleted,
    t.userLoaded,
    t.userUpdated,
    t.usersLoaded,
  ]);

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
                        void selectUser(user);
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
              <div
                className="admin-settings__pagination"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1rem",
                  marginTop: "1rem",
                }}
              >
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
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
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
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
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <span>{t.username}</span>
                  {initialUserData &&
                    username.trim() !== initialUserData.username && (
                      <span className="admin-settings__modified-indicator">
                        * geändert
                      </span>
                    )}
                </div>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={!canWriteUsers || isBusy || !initialUserData}
                />
              </label>

              <div className="admin-settings__actions">
                <ButtonGroup className="admin-settings__user-actions">
                  <Button
                    type="button"
                    className={
                      selectedUser &&
                      initialUserData &&
                      (username.trim() !== initialUserData.username ||
                        [...selectedRoles].sort().join(",") !==
                          [...initialUserData.roles].sort().join(","))
                        ? "admin-settings__btn--unsaved"
                        : ""
                    }
                    onClick={() => void updateUser()}
                    disabled={
                      !canWriteUsers ||
                      isBusy ||
                      !initialUserData ||
                      !username.trim()
                    }
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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  minHeight: "21px",
                }}
              >
                <span>{t.roles}</span>
              </div>
              <fieldset style={{ marginTop: "6px", height: "100%" }}>
                <div className="admin-settings__roles">
                  {availableRoles.map((role) => {
                    const wasInitiallyChecked =
                      initialUserData?.roles.includes(role) ?? false;
                    const isCurrentlyChecked = selectedRoles.includes(role);
                    const isRoleModified =
                      initialUserData !== null &&
                      wasInitiallyChecked !== isCurrentlyChecked;

                    return (
                      <div
                        key={role}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        <Checkbox
                          label={role}
                          checked={isCurrentlyChecked}
                          onChange={(e) => {
                            if (e.currentTarget.checked) {
                              setSelectedRoles([...selectedRoles, role]);
                            } else {
                              setSelectedRoles(
                                selectedRoles.filter((r) => r !== role),
                              );
                            }
                          }}
                          disabled={
                            !canWriteUsers || isBusy || !initialUserData
                          }
                          containerClassName="admin-settings__role-item"
                        />
                        {isRoleModified && (
                          <span className="admin-settings__modified-indicator">
                            * geändert
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {availableRoles.length === 0 && (
                    <p className="admin-settings__no-roles">
                      No roles available
                    </p>
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
