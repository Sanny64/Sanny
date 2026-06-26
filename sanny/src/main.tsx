import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@sanny/styles";
import { LanguageProvider } from "@sanny/i18n";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <>
    {/* Context Providers */}
    <StrictMode>
      <ThemeProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ThemeProvider>
    </StrictMode>
  </>,
);
