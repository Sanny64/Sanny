import { translations, useLanguage } from "@sanny/i18n";
import { Settings } from "@sanny/ui";

export default function Home() {
  const messages = translations[useLanguage().language];

  return (
    <div className="auth-overview">
      <h1>{messages.shared.auth.title}</h1>
      <p>{messages.shared.auth.noActiveRequest}</p>
      <Settings />
    </div>
  );
}
