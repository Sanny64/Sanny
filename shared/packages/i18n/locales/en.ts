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
    loginButton: "Login",
    logoutButton: "Logout",
    authenticationFailed: "Authentication failed. Please try again.",
    emailVerificationRequired: "Please verify your email before signing in.",
  },
  shared: {
    settings: {
      title: "Settings",
      appearanceTitle: "Appearance",
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
      accountTitle: "Your account",
      adminTitle: "Admin users",
      username: "Username",
      loading: "Loading account...",
      noLocalAccount: "No local account exists yet.",
      createAccount: "Create account",
      updateAccount: "Save username",
      deleteAccount: "Delete my account",
      loadUsers: "Load allusers",
      deleteUser: "Delete user",
      confirmDeleteAccount: "Delete your account permanently?",
      confirmDeleteUser: "Delete this user permanently?",
      adminSettingsTitle: "Admin settings",
      adminUsersTitle: "User administration",
      adminAccessDenied: "Administrator access is required for this page.",
      selectUser: "Select user",
      selectedUserTitle: "Selected user",
      userLookup: "User ID or email",
      loadUser: "Load user",
      updateUser: "Save user",
      roles: "Roles",
      syncRoles: "Sync roles",
      resetPassword: "Password reset",
      testTitle: "Feature tests",
      testAccountEndpoints: "Test account endpoints",
      openAdminSettings: "Open admin settings",
    },
    errors: {
      title: "Something went wrong",
      returnHome: "Return home",
      400: {
        title: "Request could not be processed",
        message: "Check the request and try again.",
      },
      404: {
        title: "Page Not Found",
        message: "The requested page could not be found.",
      },
      429: {
        title: "Too Many Requests",
        message: "Please wait a moment before trying again.",
      },
      403: {
        title: "Access Denied",
        message:
          "You do not have the necessary permissions to access this page.",
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
        message:
          "The service is currently unavailable. Please try again later.",
      },
    },
    notifications: {
      title: "Notifications",
      dismiss: "Dismiss notification",
      userSyncError: "User synchronization failed",
      accountCreated: "Account created",
      accountUpdated: "Account updated",
      accountDeleted: "Account deleted",
      userDeleted: "User deleted",
      requestFailed: "The account request failed.",
      usersLoaded: "Users loaded",
      userLoaded: "User loaded",
      userUpdated: "User updated",
      rolesUpdated: "Roles updated",
      passwordResetRequested: "Password reset email requested",
      accountTested: "Account endpoints responded successfully",
      accountLinkAuthenticationFailed:
        "Secondary authentication could not be completed. Please try again.",
      accountLinkPopupBlocked: (provider: string): string =>
        `Popup was blocked. Please allow popups and try again. After authenticating with your ${provider} account, you can confirm the linking.`,
      sessionExpiresSoon:
        "Your session expires in 15 minutes. Save your work and sign in again to continue.",
      signInAgain: "Sign in again",
      retryAfter: (seconds: number): string =>
        ` Please retry in ${seconds} second${seconds === 1 ? "" : "s"}.`,
    },
  },
};
