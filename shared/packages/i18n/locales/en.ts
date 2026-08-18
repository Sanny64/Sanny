export const en = {
  main: {
    home: "Home",
    portfolio: "Portfolio",
    projects: {
      title: "Projects",
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
    games: "Games",
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
    LoginPage: "Login Page",
  },
  shared: {
    setupProbe: {
      title: "Setup Check",
      theme: "Theme",
      language: "Language",
      toggleThemeButton: (theme: string): string =>
        theme === "dark" ? "Light Mode" : "Dark Mode",
      descriptionToggleThemeButton: (theme: string): string =>
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
      switchLanguageButton: (nextLanguage: string): string =>
        nextLanguage === "en" ? "English" : "German",
      descriptionSwitchLanguageButton: (nextLanguage: string): string =>
        nextLanguage === "en" ? "Switch to English" : "Switch to German",
    },
    settings: {
      title: "Settings",
    },
    errors: {
      title: "Error Handler",
      404: {
        title: "Page Not Found",
        message: "The requested page could not be found.",
      },
      403: {
        title: "Access Denied",
        message: "You do not have the necessary permissions to access this page.",
      },
      401: {
        title: "Not Authorized",
        message: "You must be logged in to access this page.",
      },
      500: {
        title: "Server Error",
        message: "Our backend is having trouble. Please try again later.",
      },
      503: {
        title: "Service Unavailable",
        message: "The service is currently unavailable. Please try again later.",
      }
    },
  },
};
