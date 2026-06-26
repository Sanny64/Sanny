import { useLanguage, translations } from "@sanny/i18n";
import { SharedSetupProbe } from "@sanny/ui";

export default function SAU() {
  const t = translations[useLanguage().language];
  return (
    <div className="content">
      {t.main.projects.sau.title}
      <SharedSetupProbe />
    </div>
  );
}
