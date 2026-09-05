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
    userSyncError: "User synchronization failed",
    authenticationFailed: "Authentication failed. Please try again.",
    emailVerificationRequired: "Please verify your email before signing in.",
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
      accountCreated: "Account created",
      accountUpdated: "Account updated",
      accountDeleted: "Account deleted",
      userDeleted: "User deleted",
      confirmDeleteAccount: "Delete your account permanently?",
      confirmDeleteUser: "Delete this user permanently?",
      requestFailed: "The account request failed.",
      adminSettingsTitle: "Admin settings",
      adminUsersTitle: "User administration",
      adminAccessDenied: "Administrator access is required for this page.",
      selectUser: "Select user",
      selectedUserTitle: "Selected user",
      userLookup: "User ID or email",
      loadUser: "Load user",
      updateUser: "Save user",
      roles: "Roles (comma-separated)",
      syncRoles: "Sync roles",
      usersLoaded: "Users loaded",
      userLoaded: "User loaded",
      userUpdated: "User updated",
      rolesUpdated: "Roles updated",
      resetPassword: "Send password reset",
      passwordResetRequested: "Password reset email requested",
      testTitle: "Feature tests",
      testAccountEndpoints: "Test account endpoints",
      accountTested: "Account endpoints responded successfully",
      openAdminSettings: "Open admin settings",
    },
    errors: {
      title: "Error Handler",
      404: {
        title: "Page Not Found",
        message: "The requested page could not be found.",
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
  },
};
