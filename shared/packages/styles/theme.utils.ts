import type { Theme, ThemeVariant } from './theme.types';

export function getThemeVariant(theme: Theme): ThemeVariant {
  return theme === 'dark' ? 'primary' : 'secondary';
}