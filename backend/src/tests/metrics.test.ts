import test from "node:test";
import assert from "node:assert/strict";

import {
  metricsRegistry,
  recordDatabaseQuery,
  recordHttpResponse,
  updateDependencyMetrics,
} from "../utils/metrics.js";

test("HTTP metrics normalize dynamic routes and bound labels", async () => {
  recordHttpResponse("/api/v001/users/user-123/roles", "GET", 200, 0.025);

  const metrics = await metricsRegistry.metrics();

  assert.match(
    metrics,
    /sanny_http_requests_total\{route="users",method="GET",status_class="2xx"\} 1/,
  );
  assert.match(
    metrics,
    /sanny_http_request_duration_seconds_count\{route="users",method="GET"\} 1/,
  );
  assert.doesNotMatch(metrics, /user-123/);
  assert.match(metrics, /sanny_process_start_time_seconds/);
});

test("dependency probes expose status and latency without error text", async () => {
  await updateDependencyMetrics({
    database: async () => undefined,
    redis: async () => {
      throw new Error("redis-password-must-not-appear");
    },
  });

  const metrics = await metricsRegistry.metrics();

  assert.match(metrics, /sanny_dependency_up\{dependency="database"\} 1/);
  assert.match(metrics, /sanny_dependency_up\{dependency="redis"\} 0/);
  assert.match(
    metrics,
    /sanny_dependency_probe_duration_seconds\{dependency="database"\} [0-9.]+/,
  );
  assert.doesNotMatch(metrics, /redis-password-must-not-appear/);
});

test("database query metrics bound operation and outcome labels", async () => {
  recordDatabaseQuery("$queryRawUnsafe", true, 0.025);
  recordDatabaseQuery("user-123-sensitive-query", false, 0.5);

  const metrics = await metricsRegistry.metrics();

  assert.match(
    metrics,
    /sanny_database_query_duration_seconds_count\{operation="\$queryRawUnsafe",outcome="success"\} 1/,
  );
  assert.match(
    metrics,
    /sanny_database_query_duration_seconds_count\{operation="other",outcome="failure"\} 1/,
  );
  assert.doesNotMatch(metrics, /user-123-sensitive-query/);
});
