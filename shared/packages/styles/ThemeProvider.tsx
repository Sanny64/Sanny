import { createContext, useState, useEffect, useLayoutEffect } from 'react';
import Cookies from 'js-cookie';
import type { ReactNode } from 'react';

export type Theme = 'dark' | 'light';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const themeCookieOptions = {
  expires: 365,
  path: '/',
  sameSite: 'lax' as const,
};

const themeStorageKey = 'theme';
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function resolveSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';

  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';

  return 'light';
}

function persistTheme(theme: Theme) {
  Cookies.set(themeStorageKey, theme, themeCookieOptions);
  localStorage.setItem(themeStorageKey, theme);
}

function applyThemeToDocument(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Keep a CSS class in sync for styles that expect `.dark` class
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function resolveStoredTheme(): Theme | null {
  const storedCookieTheme = Cookies.get(themeStorageKey) as Theme | undefined;
  const storedLocalTheme = localStorage.getItem(themeStorageKey) as Theme | null;

  if (storedCookieTheme === 'light' || storedCookieTheme === 'dark') {
    // Mirror cookie -> localStorage when cookie is present
    if (storedLocalTheme !== storedCookieTheme) {
      try {
        localStorage.setItem(themeStorageKey, storedCookieTheme);
      } catch {
        // ignore storage errors
      }
    }
    return storedCookieTheme;
  }

  if (storedLocalTheme === 'light' || storedLocalTheme === 'dark') {
    // No cookie present: initialize cookie from localStorage
    Cookies.set(themeStorageKey, storedLocalTheme, themeCookieOptions);
    return storedLocalTheme;
  }

  return null;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = resolveStoredTheme();
    if (storedTheme) return storedTheme;

    return resolveSystemTheme();
  });

  useEffect(() => {
    if (resolveStoredTheme()) return;

    const darkSchemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
    const lightSchemeQuery = window.matchMedia?.('(prefers-color-scheme: light)');

    const syncThemeFromSystem = () => {
      setTheme(resolveSystemTheme());
    };

    darkSchemeQuery?.addEventListener('change', syncThemeFromSystem);
    lightSchemeQuery?.addEventListener('change', syncThemeFromSystem);

    return () => {
      darkSchemeQuery?.removeEventListener('change', syncThemeFromSystem);
      lightSchemeQuery?.removeEventListener('change', syncThemeFromSystem);
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      const nextTheme = prev === 'dark' ? 'light' : 'dark';
      persistTheme(nextTheme);
      return nextTheme;
    });
  };

  const updateTheme = (nextTheme: Theme) => {
    persistTheme(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: updateTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export default ThemeProvider;