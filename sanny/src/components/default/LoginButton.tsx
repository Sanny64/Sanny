import { useLanguage, translations } from "@sanny/i18n";
import { useEffect, useState } from "react";
import { Button } from "../../../../shared/packages/ui/src/components/Button";

const apiUrl = import.meta.env.DEV
  ? import.meta.env.VITE_DEV_API_URL
  : import.meta.env.VITE_PROD_API_URL;
let authCheckPromise: Promise<Response> | null = null;

function checkAuthentication() {
  if (!authCheckPromise) {
    authCheckPromise = fetch(`${apiUrl}/api/v001/auth/me`, {
      method: "GET",
      credentials: "include",
    });
  }
  return authCheckPromise;
}

function buildAuthErrorMessage(
  error: string,
  description: string | null,
  fallback: string,
  emailVerificationRequired: string,
) {
  const normalizedDescription = description?.toLowerCase() ?? "";
  const looksLikeEmailVerificationError =
    error === "access_denied" &&
    normalizedDescription.includes("verify") &&
    normalizedDescription.includes("email");

  if (looksLikeEmailVerificationError) {
    return emailVerificationRequired;
  }

  return description ?? fallback;
}

export default function LoginButton() {
  const t = translations[useLanguage().language];
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userSyncError, setUserSyncError] = useState<string | null>(null);
  const [authCallbackError, setAuthCallbackError] = useState<{
    error: string;
    description: string | null;
  } | null>(() => {
    const query = new URLSearchParams(window.location.search);
    const authError = query.get("authError");
    if (!authError) {
      return null;
    }
    return {
      error: authError,
      description: query.get("authErrorDescription"),
    };
  });

  useEffect(() => {
    let cancelled = false;

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
          setUserSyncError(null);
        }
      } catch (syncError) {
        if (!cancelled) {
          setUserSyncError(
            syncError instanceof Error
              ? syncError.message
              : "User synchronization failed",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void syncUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authCallbackError) {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    query.delete("authError");
    query.delete("authErrorDescription");
    const nextQuery = query.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [authCallbackError]);

  const inlineErrorMessage =
    userSyncError ??
    (authCallbackError
      ? buildAuthErrorMessage(
          authCallbackError.error,
          authCallbackError.description,
          t.login.authenticationFailed,
          t.login.emailVerificationRequired,
        )
      : null);

  function getCsrfToken() {
    return document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("__Host-sanny_csrf="))
      ?.split("=")[1];
  }

  async function logout() {
    const response = await fetch(`${apiUrl}/api/v001/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "x-csrf-token": getCsrfToken() ?? "" },
    });
    if (!response.ok) {
      setUserSyncError(`Logout failed (${response.status})`);
      return;
    }
    const result = (await response.json()) as { logoutUrl?: string };
    if (!result.logoutUrl) {
      setUserSyncError(t.login.userSyncError);
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
            setAuthCallbackError(null);
            setUserSyncError(null);
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
      {inlineErrorMessage && <p>{inlineErrorMessage}</p>}
    </>
  );
}
