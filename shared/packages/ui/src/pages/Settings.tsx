import { useTheme } from "@sanny/styles";
import { useLanguage, translations } from "@sanny/i18n";
import { Button } from "../components/Button";
import { ButtonGroup } from "../components/ButtonGroup";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const nextLanguage = language === "en" ? "de" : "en";
  const t = translations[language];

  return (
    <section aria-labelledby="appearance-settings-title">
      <h2 id="appearance-settings-title">
        {t.shared.settings.appearanceTitle}
      </h2>
      <p>
        {t.shared.settings.theme}: {theme}
      </p>
      <p>
        {t.shared.settings.language}: {language}
      </p>
      <ButtonGroup layout="horizontal">
        <Button
          aria-label={t.shared.settings.descriptionToggleThemeButton(theme)}
          onClick={toggleTheme}
        >
          {t.shared.settings.toggleThemeButton(theme)}
        </Button>
        <Button
          aria-label={t.shared.settings.descriptionSwitchLanguageButton(
            nextLanguage,
          )}
          onClick={() => setLanguage(nextLanguage)}
        >
          {t.shared.settings.switchLanguageButton(nextLanguage)}
        </Button>
      </ButtonGroup>
    </section>
  );
}
