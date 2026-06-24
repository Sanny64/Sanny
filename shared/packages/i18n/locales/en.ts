export const en = {
  main: {
    home: 'Home',
    portfolio: 'Portfolio',
    projects: {
      title: 'Projects',
      smnow: {
        title: 'SMNow'
      },
      seos: {
        title: 'SEOS'
      },
      sau: {
        title: 'SAU'
      },
      proscrum: {
        title: 'Proscrum'
      },
      haptigation: {
        title: 'Haptigation'
      }
    },
    blog: 'Blog',
    games: 'Games',
  },
  auxiliary: {
    party: {
      title: 'Party',
      refreshing: {
        title: 'Refreshing Kit'
      },
      comfort: {
        title: 'Period Comfort Kit'
      }
    }
  },
  login: {
    LoginPage: 'Login Page',
  },
  shared: {
    setupProbe: {
      title: 'Setup Check',
      theme: 'Theme',
      language: 'Language',
      toggleThemeButton: (theme: string): string =>
        theme === 'dark' ? 'Light Mode' : 'Dark Mode',
      descriptionToggleThemeButton: (theme: string): string =>
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
      switchLanguageButton: (nextLanguage: string): string =>
        nextLanguage === 'en' ? 'English' : 'German',
      descriptionSwitchLanguageButton: (nextLanguage: string): string =>
        nextLanguage === 'en' ? 'Switch to English' : 'Switch to German'
    },
    settings: {
      title: 'Settings',
    },
    errors: {
      title: 'Error Handler',
    }
  }
}