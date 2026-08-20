import { useLanguage, translations } from "@sanny/i18n";
import { useEffect, useState } from "react";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export default function LoginPage() {
  const t = translations[useLanguage().language];
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userSyncError, setUserSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function syncUser() {
      try {
        const authResponse = await fetch(`${apiUrl}/api/v001/auth/me`, {
          method: "GET",
          credentials: "include",
        });

        if (authResponse.status === 401) return;
        if (!authResponse.ok) {
          throw new Error(`Authentication check failed (${authResponse.status})`);
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

  function getCsrfToken() {
    return document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("sanny_csrf="))
      ?.split("=")[1];
  }

  async function logout() {
    await fetch(`${apiUrl}/api/v001/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { "x-csrf-token": getCsrfToken() ?? "" },
    });
    setIsAuthenticated(false);
  }

  return (
    <div className="content">
      {t.login.LoginPage}
      {!isLoading && !isAuthenticated && (
        <button type="button" onClick={() => { window.location.href = `${apiUrl}/api/v001/auth`; }}>
          Log in
        </button>
      )}
      {!isLoading && isAuthenticated && (
        <button
          type="button"
          onClick={() => void logout()}
        >
          Log out
        </button>
      )}
      {userSyncError && <p>{userSyncError}</p>}
    </div>
  );
}
