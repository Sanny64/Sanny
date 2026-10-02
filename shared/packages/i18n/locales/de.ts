import type { Translations } from "../language.types.ts";

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
      confirmDeleteAccount: "Dein Konto dauerhaft löschen?",
      confirmDeleteUser: "Diesen Benutzer dauerhaft löschen?",
      adminSettingsTitle: "Admin-Einstellungen",
      adminUsersTitle: "Benutzerverwaltung",
      adminAccessDenied:
        "Fuer diese Seite sind Administratorrechte erforderlich.",
      selectUser: "Benutzer auswaehlen",
      selectedUserTitle: "Ausgewaehlter Benutzer",
      userLookup: "Benutzer-ID oder E-Mail",
      loadUser: "Benutzer laden",
      updateUser: "Benutzer speichern",
      roles: "Rollen",
      syncRoles: "Rollen synchronisieren",
      resetPassword: "Passwort-Reset",
      testTitle: "Funktions-Tests",
      testAccountEndpoints: "Konto-Endpunkte testen",
      openAdminSettings: "Admin-Einstellungen oeffnen",
    },
    errors: {
      title: "Ein Fehler ist aufgetreten",
      returnHome: "Zur Startseite",
      400: {
        title: "Anfrage konnte nicht verarbeitet werden",
        message: "Bitte überprüfe die Anfrage und versuche es erneut.",
      },
      404: {
        title: "Seite nicht gefunden",
        message: "Die angeforderte Seite konnte nicht gefunden werden.",
      },
      429: {
        title: "Zu viele Anfragen",
        message: "Bitte warte kurz und versuche es erneut.",
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
    notifications: {
      title: "Benachrichtigungen",
      dismiss: "Benachrichtigung schließen",
      userSyncError: "Benutzersynchronisierung fehlgeschlagen",
      accountCreated: "Konto erstellt",
      accountUpdated: "Konto aktualisiert",
      accountDeleted: "Konto gelöscht",
      userDeleted: "Benutzer gelöscht",
      requestFailed: "Die Kontoanfrage ist fehlgeschlagen.",
      usersLoaded: "Benutzer geladen",
      userLoaded: "Benutzer geladen",
      userUpdated: "Benutzer aktualisiert",
      rolesUpdated: "Rollen aktualisiert",
      passwordResetRequested: "Passwort-Reset-E-Mail angefordert",
      accountTested: "Konto-Endpunkte haben erfolgreich geantwortet",
      accountLinkAuthenticationFailed:
        "Die zusätzliche Authentifizierung konnte nicht abgeschlossen werden. Bitte versuche es erneut.",
      accountLinkPopupBlocked: (provider: string): string =>
        `Das Popup wurde blockiert. Bitte erlaube Popups und versuche es erneut. Nach der Authentifizierung mit deinem ${provider}-Konto kannst du die Verknüpfung bestätigen.`,
      sessionExpiresSoon:
        "Deine Sitzung läuft in 15 Minuten ab. Speichere deine Arbeit und melde dich erneut an, um fortzufahren.",
      signInAgain: "Erneut anmelden",
      retryAfter: (seconds: number): string =>
        ` Bitte versuche es in ${seconds} Sekunde${seconds === 1 ? "" : "n"} erneut.`,
    },
  },
};
