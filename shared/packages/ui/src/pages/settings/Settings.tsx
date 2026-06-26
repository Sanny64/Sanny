import { useLanguage, translations } from "@sanny/i18n";
import { SharedSetupProbe } from "@sanny/ui";

export default function Settings() {
  const t = translations[useLanguage().language];
  return (
    <div className="content">
      {/* TODO: Implement actual settings management with forms and state handling, replacing the placeholder content */}
      {t.shared.settings.title}
      <SharedSetupProbe />
    </div>
  );
}
