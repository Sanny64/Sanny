import { useLanguage, translations } from "@sanny/i18n";

export default function Comfort() {
  const t = translations[useLanguage().language];
  return <div>{t.auxiliary.party.comfort.title}</div>;
}
