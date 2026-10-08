import test from "node:test";
import assert from "node:assert/strict";

import {
  serializeError,
  serializeRequest,
  serializeResponse,
} from "../utils/logger.js";

test("request serializer keeps only normalized route and bounded method", () => {
  const request = {
    method: "GET",
    routeOptions: { url: "/api/v001/users/:id" },
    url: "/api/v001/users/user-123?access_token=secret",
    headers: { authorization: "Bearer secret", cookie: "session=secret" },
    params: { id: "user-123" },
    body: { password: "secret" },
  };

  assert.deepEqual(serializeRequest(request), {
    method: "GET",
    route: "users",
  });
  assert.equal(
    JSON.stringify(serializeRequest(request)).includes("secret"),
    false,
  );
});

test("response and error serializers omit sensitive response and error data", () => {
  const error = new Error("database password: secret");
  Object.assign(error, { access_token: "secret", statusCode: 500 });
  const response = { statusCode: 500, headers: { cookie: "secret" } };

  assert.deepEqual(serializeResponse(response), {
    statusCode: 500,
  });
  assert.deepEqual(serializeError(error), { type: "Error" });
  assert.equal(JSON.stringify(serializeError(error)).includes("secret"), false);
});
