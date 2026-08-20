import { useLanguage, translations } from "@sanny/i18n";
import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export default function LoginPage() {
  const t = translations[useLanguage().language];
  const {
    error,
    getAccessTokenSilently,
    isAuthenticated,
    isLoading,
    logout,
    loginWithRedirect,
  } = useAuth0();
  const [userSyncError, setUserSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;

    async function syncUser() {
      try {
        const accessToken = await getAccessTokenSilently();

        const authResponse = await fetch(`${apiUrl}/api/v001/auth/me`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!authResponse.ok) {
          throw new Error(`Authentication check failed (${authResponse.status})`);
        }

        if (!cancelled) {
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
      }
    }

    void syncUser();

    return () => {
      cancelled = true;
    };
  }, [getAccessTokenSilently, isAuthenticated]);

  return (
    <div className="content">
      {t.login.LoginPage}
      {!isLoading && !isAuthenticated && (
        <button type="button" onClick={() => void loginWithRedirect()}>
          Log in
        </button>
      )}
      {!isLoading && isAuthenticated && (
        <button
          type="button"
          onClick={() => void logout({ logoutParams: { returnTo: window.location.origin } })}
        >
          Log out
        </button>
      )}
      {error && <p>{error.message}</p>}
      {userSyncError && <p>{userSyncError}</p>}
    </div>
  );
}
