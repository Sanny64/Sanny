import pino from "pino";

const logTargets = [
  { target: "pino/file", options: { destination: 1 } },
  ...(process.env.APP_LOG_FILE?.trim()
    ? [
        {
          target: "pino/file",
          options: {
            destination: process.env.APP_LOG_FILE.trim(),
            mkdir: true,
          },
        },
      ]
    : []),
];

function getRouteGroup(route: string | undefined): string {
  if (route === "/healthcheck") return "healthcheck";
  if (route === "/metrics") return "metrics";
  if (route?.startsWith("/api/v001/auth")) return "auth";
  if (route?.startsWith("/api/v001/users")) return "users";
  if (route?.startsWith("/api/v001")) return "api_other";
  return "other";
}

export function serializeRequest(request: {
  method: string;
  routeOptions?: { url?: string };
}) {
  const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
  return {
    method: methods.includes(request.method) ? request.method : "OTHER",
    route: getRouteGroup(request.routeOptions?.url),
  };
}

export function serializeResponse(reply: { statusCode: number }) {
  return { statusCode: reply.statusCode };
}

export function serializeError(error: Error) {
  return { type: error.name };
}

export const appLogger = pino({
  level: "info",
  redact: {
    paths: [
      "req.body",
      "res.body",
      "req.headers",
      "res.headers",
      "access_token",
      "refresh_token",
      "accessToken",
      "refreshToken",
      "sessionId",
      "csrfToken",
      "client_secret",
      "clientSecret",
      "authorization",
      "cookie",
      "password",
      "code",
      "codeVerifier",
      "email",
      "userId",
      "auth0Sub",
      "sub",
      "ip",
      "*.access_token",
      "*.refresh_token",
      "*.accessToken",
      "*.refreshToken",
      "*.sessionId",
      "*.csrfToken",
      "*.client_secret",
      "*.clientSecret",
      "*.authorization",
      "*.cookie",
      "*.password",
      "*.code",
      "*.codeVerifier",
      "*.email",
      "*.userId",
      "*.auth0Sub",
      "*.sub",
      "*.ip",
    ],
    censor: "[REDACTED]",
  },
  serializers: {
    req: serializeRequest,
    res: serializeResponse,
    err: serializeError,
  },
  transport: { targets: logTargets },
});
