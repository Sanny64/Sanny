import Cookies from 'js-cookie';
import { themeCookieOptions, themeStorageKey } from './theme.config';
import type { Theme, ThemeVariant } from './theme.types';

export function resolveStoredTheme(): Theme | null {
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

export function resolveSystemTheme(): Theme {
  // if window is undefined (SSR), default to light theme
  if (typeof window === 'undefined') return 'light';

  // if system theme is set return relative theme
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';

  // if no system theme is set, default to light theme
  return 'light';
}

export function watchSystemTheme(onChange: () => void) {
  const darkSchemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
  const lightSchemeQuery = window.matchMedia?.('(prefers-color-scheme: light)');

  darkSchemeQuery?.addEventListener('change', onChange);
  lightSchemeQuery?.addEventListener('change', onChange);

  return () => {
    darkSchemeQuery?.removeEventListener('change', onChange);
    lightSchemeQuery?.removeEventListener('change', onChange);
  };
}

export function persistTheme(theme: Theme) {
  Cookies.set(themeStorageKey, theme, themeCookieOptions);
  localStorage.setItem(themeStorageKey, theme);
}

export function applyThemeToDocument(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  // Keep a CSS class in sync for styles that expect `.dark` class
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function getThemeVariant(theme: Theme): ThemeVariant {
  return theme === 'dark' ? 'primary' : 'secondary';
}