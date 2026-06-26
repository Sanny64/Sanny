import { useLanguage, translations } from "@sanny/i18n";
import { SharedSetupProbe } from "@sanny/ui";

export default function SEOS() {
  const t = translations[useLanguage().language];
  return (
    <>
      <div className="content">
        {t.main.projects.seos.title}
        <SharedSetupProbe />
      </div>
    </>
  );
}
