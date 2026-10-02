import { Link, useSearchParams } from "react-router-dom";
import { useLanguage, translations } from "@sanny/i18n";
import { Section } from "@sanny/ui";
import "@sanny/styles/globals.css";
import "@sanny/styles/main.css";

const supportedStatuses = [400, 401, 403, 404, 429, 500, 503] as const;
type ErrorStatus = (typeof supportedStatuses)[number];

function getErrorStatus(value: string | null): ErrorStatus {
  const parsed = Number(value);
  const supportedStatus = supportedStatuses.find((status) => status === parsed);
  if (supportedStatus) return supportedStatus;
  return Number.isInteger(parsed) && parsed >= 400 && parsed < 500 ? 400 : 500;
}

export default function ErrorPage() {
  const [searchParams] = useSearchParams();
  const t = translations[useLanguage().language];
  const status = getErrorStatus(searchParams.get("status"));
  const error = t.shared.errors[status];
  const authError = searchParams.get("authError");
  const description = searchParams.get("authErrorDescription");
  const message =
    authError === "access_denied" &&
    description?.toLowerCase().includes("verify") &&
    description.toLowerCase().includes("email")
      ? t.login.emailVerificationRequired
      : description || error.message;

  return (
    <main className="error-page">
      <h1>{t.shared.errors.title}</h1>
      <Section className="error-section" variant="primary">
        <h2>{error.title}</h2>
        <p>{message}</p>
        <Link to="/">{t.shared.errors.returnHome}</Link>
      </Section>
    </main>
  );
}
