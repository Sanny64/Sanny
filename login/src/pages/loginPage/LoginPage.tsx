import { useLanguage, translations } from '@sanny/i18n';
import { SharedSetupProbe } from '@sanny/ui';

export default function LoginPage() {
  const t = translations[useLanguage().language];
  return (
    <div className="content">
      {t.login.LoginPage}
      <SharedSetupProbe />
    </div>
  );
}