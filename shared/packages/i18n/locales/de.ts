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
    loginButton: "Anmelden",
    logoutButton: "Abmelden",
    userSyncError: "Benutzersynchronisierung fehlgeschlagen",
    authenticationFailed:
      "Authentifizierung fehlgeschlagen. Bitte versuche es erneut.",
    emailVerificationRequired:
      "Bitte verifiziere deine E-Mail-Adresse, bevor du dich anmeldest.",
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
      accountTitle: "Dein Konto",
      adminTitle: "Admin-Benutzer",
      username: "Benutzername",
      loading: "Konto wird geladen...",
      noLocalAccount: "Es existiert noch kein lokales Konto.",
      createAccount: "Konto erstellen",
      updateAccount: "Benutzername speichern",
      deleteAccount: "Mein Konto löschen",
      loadUsers: "Alle Benutzer laden",
      deleteUser: "Benutzer löschen",
      accountCreated: "Konto erstellt",
      accountUpdated: "Konto aktualisiert",
      accountDeleted: "Konto gelöscht",
      userDeleted: "Benutzer gelöscht",
      confirmDeleteAccount: "Dein Konto dauerhaft löschen?",
      confirmDeleteUser: "Diesen Benutzer dauerhaft löschen?",
      requestFailed: "Die Kontoanfrage ist fehlgeschlagen.",
      adminSettingsTitle: "Admin-Einstellungen",
      adminUsersTitle: "Benutzerverwaltung",
      adminAccessDenied:
        "Fuer diese Seite sind Administratorrechte erforderlich.",
      selectUser: "Benutzer auswaehlen",
      selectedUserTitle: "Ausgewaehlter Benutzer",
      userLookup: "Benutzer-ID oder E-Mail",
      loadUser: "Benutzer laden",
      updateUser: "Benutzer speichern",
      roles: "Rollen (durch Kommas getrennt)",
      syncRoles: "Rollen synchronisieren",
      usersLoaded: "Benutzer geladen",
      userLoaded: "Benutzer geladen",
      userUpdated: "Benutzer aktualisiert",
      rolesUpdated: "Rollen aktualisiert",
      resetPassword: "Passwort-Reset senden",
      passwordResetRequested: "Passwort-Reset-E-Mail angefordert",
      testTitle: "Funktions-Tests",
      testAccountEndpoints: "Konto-Endpunkte testen",
      accountTested: "Konto-Endpunkte haben erfolgreich geantwortet",
      openAdminSettings: "Admin-Einstellungen oeffnen",
    },
    errors: {
      title: "Error Handler",
      404: {
        title: "Seite nicht gefunden",
        message: "Die angeforderte Seite konnte nicht gefunden werden.",
      },
      403: {
        title: "Zugriff verweigert",
        message:
          "Sie haben nicht die notwendigen Rechte, um auf diese Seite zuzugreifen.",
      },
      401: {
        title: "Nicht autorisiert",
        message: "Sie müssen sich anmelden, um auf diese Seite zuzugreifen.",
      },
      500: {
        title: "Serverfehler",
        message:
          "Unser Backend hat Probleme. Bitte versuchen Sie es später erneut.",
      },
      503: {
        title: "Dienst nicht verfügbar",
        message:
          "Der Dienst ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.",
      },
    },
  },
};
