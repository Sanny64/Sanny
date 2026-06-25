import { useLanguage, translations } from '@sanny/i18n';
import { SharedSetupProbe } from '@sanny/ui';

export default function Refreshing() {
  const t = translations[useLanguage().language];
  return (
    <div>
      {t.auxiliary.party.refreshing.title}
      <SharedSetupProbe />
    </div>
  );
}