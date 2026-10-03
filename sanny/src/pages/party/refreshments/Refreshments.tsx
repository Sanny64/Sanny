import { useLanguage, translations } from "@sanny/i18n";

export default function Refreshments() {
  const t = translations[useLanguage().language];
  return (
    <div className="party-page party-page--refreshments">
      {t.auxiliary.party.refreshments.title}
    </div>
  );
}
