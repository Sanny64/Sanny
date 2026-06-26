import { useLanguage, translations } from "@sanny/i18n";
import { SharedSetupProbe } from "@sanny/ui";

export default function Home() {
  const t = translations[useLanguage().language];
  return (
    <div className="content">
      {t.main.home}
      <SharedSetupProbe />
    </div>
  );
}
