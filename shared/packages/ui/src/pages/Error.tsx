import {
  isRouteErrorResponse,
  Link,
  useRouteError,
  useSearchParams,
} from "react-router-dom";
import { useLanguage, translations } from "@sanny/i18n";
import { Section } from "@sanny/ui";
import { getErrorStatus, type ErrorStatus } from "../utils/error-status";

export default function ErrorPage({
  status: pageStatus,
}: {
  status?: ErrorStatus;
} = {}) {
  const [searchParams] = useSearchParams();
  const routeError = useRouteError();
  const t = translations[useLanguage().language];
  const status = isRouteErrorResponse(routeError)
    ? getErrorStatus(routeError.status)
    : routeError
      ? 500
      : (pageStatus ?? getErrorStatus(searchParams.get("status")));
  const error = t.shared.errors[status];
  const authError =
    pageStatus || routeError ? null : searchParams.get("authError");
  const description =
    pageStatus || routeError ? null : searchParams.get("authErrorDescription");
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
