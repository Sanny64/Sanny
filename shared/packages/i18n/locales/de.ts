import type { Translations } from "../language.types";

export const de: Translations = {
  main: {
    home: "Startseite",
    portfolio: "Portfolio",
    projects: {
      title: "Projekte",
      smnow: {
        title: "SMNow",
      },
      seos: {
        title: "SEOS",
      },
      sau: {
        title: "SAU",
      },
      proscrum: {
        title: "Proscrum",
      },
      haptigation: {
        title: "Haptigation",
      },
    },
    blog: "Blog",
    games: "Spiele",
  },
  auxiliary: {
    party: {
      title: "Party",
      refreshments: {
        title: "Refreshments Kit",
      },
      comfort: {
        title: "Period Comfort Kit",
      },
    },
  },
  login: {
    LoginPage: "Login Seite",
  },
  shared: {
    setupProbe: {
      title: "Einrichtungsüberprüfung",
      theme: "Darstellung",
      language: "Sprache",
      toggleThemeButton: (theme: string): string =>
        theme === "dark" ? "Heller Modus" : "Dunkler Modus",
      descriptionToggleThemeButton: (theme: string): string =>
        theme === "dark"
          ? "Wechselt zu hellem Modus"
          : "Wechselt zu dunklem Modus",
      switchLanguageButton: (nextLanguage: string): string =>
        nextLanguage === "en" ? "Englisch" : "Deutsch",
      descriptionSwitchLanguageButton: (nextLanguage: string): string =>
        nextLanguage === "en" ? "Wechselt zu Englisch" : "Wechselt zu Deutsch",
    },
    settings: {
      title: "Einstellungen",
    },
    errors: {
      title: "Error Handler",
    },
  },
};
