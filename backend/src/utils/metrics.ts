import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "@prometheus-io/client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: "sanny_" });

const httpRequests = new Counter<"route" | "method" | "status_class">({
  name: "sanny_http_requests_total",
  help: "HTTP responses served by route group, method, and status class.",
  labelNames: ["route", "method", "status_class"],
  registers: [metricsRegistry],
});

const httpRequestDuration = new Histogram<"route" | "method">({
  name: "sanny_http_request_duration_seconds",
  help: "HTTP request duration in seconds by route group and method.",
  labelNames: ["route", "method"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

const redisFallbacks = new Counter<"operation">({
  name: "sanny_redis_fallbacks_total",
  help: "Redis-backed operations served by the local fallback.",
  labelNames: ["operation"],
  registers: [metricsRegistry],
});

const refreshTokenEvents = new Counter<"outcome">({
  name: "sanny_refresh_token_events_total",
  help: "Refresh-token flow outcomes.",
  labelNames: ["outcome"],
  registers: [metricsRegistry],
});

const auth0ManagementRequests = new Counter<"result">({
  name: "sanny_auth0_management_requests_total",
  help: "Auth0 Management API requests by result.",
  labelNames: ["result"],
  registers: [metricsRegistry],
});

const dependencyUp = new Gauge<"dependency">({
  name: "sanny_dependency_up",
  help: "Whether the latest dependency probe succeeded.",
  labelNames: ["dependency"],
  registers: [metricsRegistry],
});

const dependencyProbeDuration = new Gauge<"dependency">({
  name: "sanny_dependency_probe_duration_seconds",
  help: "Duration of the latest dependency probe in seconds.",
  labelNames: ["dependency"],
  registers: [metricsRegistry],
});

const databaseQueryDuration = new Histogram<"operation" | "outcome">({
  name: "sanny_database_query_duration_seconds",
  help: "Prisma operation duration in seconds by operation and outcome.",
  labelNames: ["operation", "outcome"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

const prismaOperations = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
  "$queryRaw",
  "$queryRawUnsafe",
  "$executeRaw",
  "$executeRawUnsafe",
]);

export function recordRedisFallback(operation: "rate_limit" | "auth0_budget") {
  redisFallbacks.inc({ operation });
}

export function recordRefreshTokenEvent(
  outcome: "attempted" | "succeeded" | "failed" | "replay_detected",
): void {
  refreshTokenEvents.inc({ outcome });
}

export function recordAuth0ManagementRequest(succeeded: boolean): void {
  auth0ManagementRequests.inc({ result: succeeded ? "success" : "failure" });
}

export async function updateDependencyMetrics(probes: {
  database: () => Promise<unknown>;
  redis: () => Promise<unknown>;
}): Promise<void> {
  const dependencies = [
    ["database", probes.database],
    ["redis", probes.redis],
  ] as const;

  await Promise.all(
    dependencies.map(async ([dependency, probe]) => {
      const startedAt = performance.now();
      try {
        await probe();
        dependencyUp.set({ dependency }, 1);
      } catch {
        dependencyUp.set({ dependency }, 0);
      } finally {
        dependencyProbeDuration.set(
          { dependency },
          (performance.now() - startedAt) / 1000,
        );
      }
    }),
  );
}

function routeGroup(route: string | undefined): string {
  if (route === "/healthcheck") return "healthcheck";
  if (route === "/metrics") return "metrics";
  if (route?.startsWith("/api/v001/auth")) return "auth";
  if (route?.startsWith("/api/v001/users")) return "users";
  if (route?.startsWith("/api/v001")) return "api_other";
  return "other";
}

function methodGroup(method: string): string {
  return ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(
    method,
  )
    ? method
    : "OTHER";
}

export function recordHttpResponse(
  route: string | undefined,
  method: string,
  statusCode: number,
  durationSeconds: number,
): void {
  const labels = {
    route: routeGroup(route),
    method: methodGroup(method),
  };
  const statusClass = `${Math.floor(statusCode / 100)}xx`;
  httpRequests.inc({ ...labels, status_class: statusClass });
  httpRequestDuration.observe(labels, durationSeconds);
}

export function recordDatabaseQuery(
  operation: string,
  succeeded: boolean,
  durationSeconds: number,
): void {
  databaseQueryDuration.observe(
    {
      operation: prismaOperations.has(operation) ? operation : "other",
      outcome: succeeded ? "success" : "failure",
    },
    durationSeconds,
  );
}
