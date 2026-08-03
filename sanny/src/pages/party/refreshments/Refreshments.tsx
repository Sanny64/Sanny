import { useLanguage, translations } from "@sanny/i18n";
import { SharedSetupProbe } from "@sanny/ui";

export default function Refreshments() {
  const t = translations[useLanguage().language];
  return (
    <div className="party-page party-page--refreshments">
      {t.auxiliary.party.refreshments.title}
      <SharedSetupProbe className="party-setup-probe" />
    </div>
  );
}
