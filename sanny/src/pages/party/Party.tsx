import { useLanguage, translations } from "@sanny/i18n";
import { SharedSetupProbe } from "@sanny/ui";

export default function Party() {
  const t = translations[useLanguage().language];
  return (
    <div className="content">
      {t.auxiliary.party.title}
      <SharedSetupProbe />
    </div>
  );
}
