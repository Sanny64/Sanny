import { useLanguage, translations } from "@sanny/i18n";
import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { Button, dismissToast, showToast } from "@sanny/ui";
import { authChangedEvent } from "../../utils/authEvents";
import { showBackendRequestError } from "../../utils/backendRequestErrors";
import { isLogoutReturn, prepareLogoutUrl } from "../../utils/reauthentication";

type Identity = { roles?: string[] };

type LoginButtonProps = {
  className?: string;
  autoVariant?: boolean;
  onIdentityChange?: (identity: Identity | null) => void;
};

const sessionWarningLeadMs = 15 * 60 * 1000;

const apiUrl = import.meta.env.VITE_API_URL;
let authCheckPromise: Promise<Response> | null = null;

function checkAuthentication() {
  if (!authCheckPromise) {
    authCheckPromise = fetch(`${apiUrl}/api/v001/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: { accept: "application/json" },
    });
  }
  return authCheckPromise;
}

function authenticationUrl(reauthenticate = false) {
  const url = new URL("/api/v001/auth", apiUrl);
  url.searchParams.set(
    "returnTo",
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  if (reauthenticate) url.searchParams.set("reauthenticate", "true");
  return url.toString();
}

export default function LoginButton({
  className,
  autoVariant = true,
  onIdentityChange,
}: LoginButtonProps) {
  const { language } = useLanguage();
  const t = translations[language];
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authVersion, setAuthVersion] = useState(0);
  const sessionWarningToastId = useRef<number | undefined>(undefined);

  useEffect(() => {
    function handleAuthChanged() {
      authCheckPromise = null;
      setIsLoading(true);
      setIsAuthenticated(false);
      onIdentityChange?.(null);
      setAuthVersion((version) => version + 1);
    }
    window.addEventListener(authChangedEvent, handleAuthChanged);
    return () =>
      window.removeEventListener(authChangedEvent, handleAuthChanged);
  }, [onIdentityChange]);

  useEffect(() => {
    let cancelled = false;
    let sessionWarningTimer: number | undefined;

    async function syncUser() {
      try {
        if (isLogoutReturn()) return;
        const authResponse = await checkAuthentication();

        if (authResponse.status === 401) {
          if (!cancelled) {
            setIsAuthenticated(false);
            onIdentityChange?.(null);
          }
          return;
        }
        if (!authResponse.ok) {
          throw new Error(
            `Authentication check failed (${authResponse.status})`,
          );
        }

        const identity = (await authResponse.clone().json()) as Identity;

        if (!cancelled) {
          setIsAuthenticated(true);
          onIdentityChange?.(identity);
          const sessionExpiryHeader = authResponse.headers.get(
            "X-Session-Expires-At",
          );
          const sessionExpiresAt = Number(sessionExpiryHeader);
          if (sessionExpiryHeader && Number.isFinite(sessionExpiresAt)) {
            const warningDelay =
              sessionExpiresAt - Date.now() - sessionWarningLeadMs;
            const showSessionWarning = () => {
              sessionWarningToastId.current = showToast(
                t.shared.notifications.sessionExpiresSoon,
                {
                  kind: "warning",
                  durationMs: 0,
                  action: {
                    label: t.shared.notifications.signInAgain,
                    onClick: () => {
                      window.location.href = authenticationUrl(true);
                    },
                  },
                },
              );
            };
            if (warningDelay <= 0) {
              showSessionWarning();
            } else {
              sessionWarningTimer = window.setTimeout(
                showSessionWarning,
                warningDelay,
              );
            }
          }
        }
      } catch (syncError) {
        if (!cancelled) {
          showBackendRequestError(
            syncError,
            t.shared.notifications.backendOffline,
            t.shared.notifications.userSyncError,
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void syncUser();

    return () => {
      cancelled = true;
      if (sessionWarningTimer !== undefined) {
        window.clearTimeout(sessionWarningTimer);
      }
      if (sessionWarningToastId.current !== undefined) {
        dismissToast(sessionWarningToastId.current);
        sessionWarningToastId.current = undefined;
      }
    };
  }, [t, authVersion, onIdentityChange]);

  function getCsrfToken() {
    return document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("__Host-sanny_csrf="))
      ?.split("=")[1];
  }

  async function logout() {
    let response: Response;
    try {
      response = await fetch(`${apiUrl}/api/v001/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: {
          accept: "application/json",
          "x-csrf-token": getCsrfToken() ?? "",
        },
      });
    } catch (error) {
      showBackendRequestError(
        error,
        t.shared.notifications.backendOffline,
        "Logout request failed",
      );
      return;
    }
    if (!response.ok) {
      const message = `Logout failed (${response.status})`;
      showToast(message);
      return;
    }
    if (sessionWarningToastId.current !== undefined) {
      dismissToast(sessionWarningToastId.current);
      sessionWarningToastId.current = undefined;
    }
    let result: { logoutUrl?: string };
    try {
      result = (await response.json()) as { logoutUrl?: string };
    } catch {
      showToast(t.shared.notifications.userSyncError);
      return;
    }
    if (!result.logoutUrl) {
      showToast(t.shared.notifications.userSyncError);
      return;
    }
    window.location.href = prepareLogoutUrl(result.logoutUrl);
  }

  return (
    <Button
      className={className}
      type="button"
      variant={autoVariant && !isAuthenticated ? "primary" : "secondary"}
      disabled={isLoading}
      onClick={() => {
        if (isAuthenticated) {
          void logout();
        } else {
          window.location.href = authenticationUrl();
        }
      }}
    >
      {isAuthenticated ? (
        <LogOut size={18} aria-hidden="true" />
      ) : (
        <LogIn size={18} aria-hidden="true" />
      )}
      {isAuthenticated ? t.login.logoutButton : t.login.loginButton}
    </Button>
  );
}
