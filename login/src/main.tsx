import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@sanny/styles";
import { LanguageProvider } from "@sanny/i18n";
import { Auth0Provider } from "@auth0/auth0-react";
import App from "./App.tsx";

function getRequiredConfig(name: string): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Add it to login/.env.local.`);
  }
  return value;
}

const auth0Domain = getRequiredConfig("VITE_AUTH0_DOMAIN");
const auth0ClientId = getRequiredConfig("VITE_AUTH0_CLIENT_ID");
const auth0Audience = getRequiredConfig("VITE_AUTH0_AUDIENCE");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Context Providers */}
    <ThemeProvider>
      <LanguageProvider>
        <Auth0Provider
          domain={auth0Domain}
          clientId={auth0ClientId}
          authorizationParams={{
            redirect_uri: window.location.origin,
            audience: auth0Audience,
            scope: "openid profile email offline_access update:me",
            connection: "sannysdb-1",
          }}
          useRefreshTokens
          cacheLocation="memory"
        >
          <App />
        </Auth0Provider>
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
);
