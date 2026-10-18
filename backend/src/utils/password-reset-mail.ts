import nodemailer from "nodemailer";

export class PasswordResetMailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PasswordResetMailError";
  }
}

function requiredMailEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new PasswordResetMailError(`${name} must be configured`);
  }
  return value;
}

function isMailbox(value: string): boolean {
  return /^[^\s<>@]+@[^\s<>@]+$/.test(value);
}

export function getPasswordResetMailConfig() {
  const hostValue = requiredMailEnv("SMTP_HOST");
  let endpoint: URL;
  try {
    endpoint = new URL(`smtp://${hostValue}`);
  } catch {
    throw new PasswordResetMailError(
      "SMTP_HOST must be a hostname with an optional port",
    );
  }
  if (
    !endpoint.hostname ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new PasswordResetMailError(
      "SMTP_HOST must be a hostname with an optional port",
    );
  }
  const port = endpoint.port ? Number(endpoint.port) : 587;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new PasswordResetMailError("SMTP_HOST has an invalid port");
  }
  const from = requiredMailEnv("SMTP_FROM_ADDRESS");
  if (!isMailbox(from)) {
    throw new PasswordResetMailError(
      "SMTP_FROM_ADDRESS must be a single email address",
    );
  }

  return {
    host: endpoint.hostname,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: {
      user: requiredMailEnv("SMTP_USER"),
      pass: requiredMailEnv("SMTP_PASSWORD"),
    },
    from,
  };
}

export async function sendPasswordResetMail(
  email: string,
  ticket: string,
): Promise<void> {
  if (!isMailbox(email)) {
    throw new PasswordResetMailError(
      "Password reset recipient must be a single email address",
    );
  }
  const { from, ...options } = getPasswordResetMailConfig();
  const transport = nodemailer.createTransport({
    ...options,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });

  try {
    const result = await transport.sendMail({
      from: { name: "Sanny", address: from },
      to: { address: email, name: "" },
      subject: "Sanny password reset / Passwort zuruecksetzen",
      text: [
        "A password reset was requested for your Sanny account.",
        "Use this link within 15 minutes to choose a new password:",
        ticket,
        "",
        "If you did not request this reset, you can ignore this email.",
        "",
        "Fuer dein Sanny-Konto wurde ein Passwort-Reset angefordert.",
        "Mit diesem Link kannst du innerhalb von 15 Minuten ein neues Passwort waehlen.",
        "Falls du keinen Passwort-Reset angefordert hast, ignoriere diese E-Mail.",
      ].join("\n"),
    });
    if (result.accepted.length !== 1 || result.rejected.length !== 0) {
      throw new PasswordResetMailError(
        "SMTP server did not accept the reset email",
      );
    }
  } catch (error) {
    if (error instanceof PasswordResetMailError) throw error;
    // SMTP error responses can contain credentials or the reset URL.
    const code =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    const safeCode =
      typeof code === "string" && /^[A-Z0-9_]{1,40}$/.test(code)
        ? ` (${code})`
        : "";
    throw new PasswordResetMailError(
      `Password reset email delivery failed${safeCode}`,
    );
  } finally {
    transport.close();
  }
}
