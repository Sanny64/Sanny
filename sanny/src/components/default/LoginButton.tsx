import { useLanguage, translations } from "@sanny/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../shared/packages/ui/src/components/Button";
import { dismissToast, showToast } from "@sanny/ui";

const sessionWarningLeadMs = 15 * 60 * 1000;

const apiUrl = import.meta.env.DEV
  ? import.meta.env.VITE_DEV_API_URL
  : import.meta.env.VITE_PROD_API_URL;
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

export default function LoginButton() {
  const t = translations[useLanguage().language];
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const sessionWarningToastId = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let sessionWarningTimer: number | undefined;

    async function syncUser() {
      try {
        const authResponse = await checkAuthentication();

        if (authResponse.status === 401) return;
        if (!authResponse.ok) {
          throw new Error(
            `Authentication check failed (${authResponse.status})`,
          );
        }

        if (!cancelled) {
          setIsAuthenticated(true);
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
                      window.location.href = `${apiUrl}/api/v001/auth?reauthenticate=true`;
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
          const message =
            syncError instanceof Error
              ? syncError.message
              : t.shared.notifications.userSyncError;
          showToast(message);
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
  }, [t]);

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
      const message =
        error instanceof Error ? error.message : "Logout request failed";
      showToast(message);
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
    window.location.href = result.logoutUrl;
  }

  return (
    <>
      {!isLoading && !isAuthenticated && (
        <Button
          className="login-button"
          type="button"
          variant="primary"
          onClick={() => {
            window.location.href = `${apiUrl}/api/v001/auth`;
          }}
        >
          {t.login.loginButton}
        </Button>
      )}
      {!isLoading && isAuthenticated && (
        <Button
          className="logout-button"
          type="button"
          variant="secondary"
          onClick={() => void logout()}
        >
          {t.login.logoutButton}
        </Button>
      )}
    </>
  );
}
