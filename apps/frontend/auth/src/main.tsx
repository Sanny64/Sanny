import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@sanny/styles';
import { LanguageProvider } from '@sanny/i18n';
import App from './App.js';
import '@sanny/styles/globals.css';
import '@sanny/styles/main.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Context Providers */}
    <ThemeProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>
);
