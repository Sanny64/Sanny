// Theme types
export type Theme = 'dark' | 'light';

export interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

// Language types
export type Language = 'en' | 'de';

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

// Translation structure
export interface Translations {
  nav: {
    main: string;
    logo: string;
    home: string;
    home_redirect: string;
    about: string;
    about_redirect: string;
    projects: string;
    projects_redirect: string;
    adventure: string;
    adventure_redirect: string;
    minigame: string;
    open_menu: string;
    close_menu: string;
    settings_redirect: string;
    coded_by: string;
  },
  options: {
    menu: string;
    title: string;
    icon: string;
    login_redirect: string;
    settings_redirect: string;
    settings: string;
  },
  settings: {
    menu: string;
    title: string;
    switch: string;
    german: string;
    english: string;
    global: string;
    local: string;
    theme: string;
    darkMode: string;
    lightMode: string;
    theme_description: string;
    light_description: string;
    dark_description: string;
    language: string;
    language_description: string;
    saved_info: string;
  },
  home: {
    placeholder: string;
  },
  login: {
    placeholder: string;
  },
  about: {
    placeholder: string;
  },
  projects: {
    placeholder: string;
  },
  footer: {
    rights: string;
  };
}