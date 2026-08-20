import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Auth0Provider } from "@auth0/auth0-react";
import { ThemeProvider } from "@sanny/styles";
import { LanguageProvider } from "@sanny/i18n";
import App from "./App.tsx";

function getRequiredConfig(name: string): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Add it to sanny/.env.local.`);
  }
  return value;
}

const auth0Domain = getRequiredConfig("VITE_AUTH0_DOMAIN");
const auth0ClientId = getRequiredConfig("VITE_AUTH0_CLIENT_ID");
const auth0Audience = getRequiredConfig("VITE_AUTH0_AUDIENCE");

createRoot(document.getElementById("root")!).render(
  <>
    {/* Context Providers */}
    <StrictMode>
      <ThemeProvider>
        <LanguageProvider>
          <Auth0Provider
            domain={auth0Domain}
            clientId={auth0ClientId}
            useRefreshTokens
            cacheLocation="memory"
            authorizationParams={{
              redirect_uri: window.location.origin,
              audience: auth0Audience,
              scope: "openid profile email offline_access update:me",
              connection: "sannysdb-1",
            }}
          >
            <App />
          </Auth0Provider>
        </LanguageProvider>
      </ThemeProvider>
    </StrictMode>
  </>,
);
