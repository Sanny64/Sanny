import { useLanguage, translations } from "@sanny/i18n";
import { SharedSetupProbe } from "@sanny/ui";

export default function Comfort() {
  const t = translations[useLanguage().language];
  return (
    <div>
      {t.auxiliary.party.comfort.title}
      <SharedSetupProbe />
    </div>
  );
}
