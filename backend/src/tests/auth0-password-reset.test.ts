import assert from "node:assert/strict";
import test from "node:test";
import {
  Auth0ManagementError,
  sendAuth0PasswordResetEmail,
} from "../utils/auth0-management.js";
import { createPasswordResetErrorResponse } from "../utils/password-reset-error.js";
import { PasswordResetMailError } from "../utils/password-reset-mail.js";

const auth0Environment = {
  AUTH0_DOMAIN: "tenant.example.test",
  AUTH0_CLIENT_ID: "client-id",
  AUTH0_M2M_CLIENT_ID: "m2m-client-id",
  AUTH0_M2M_CLIENT_SECRET: "m2m-client-secret",
  AUTH0_DATABASE_CONNECTION_ID: "con_database",
  SMTP_HOST: "smtp.example.test:587",
  SMTP_USER: "mailer",
  SMTP_PASSWORD: "mail-secret",
  SMTP_FROM_ADDRESS: "sanny@example.test",
};
const ticket = "https://tenant.example.test/lo/reset?ticket=reset-secret";

async function withResetEnvironment(run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = Object.fromEntries(
    Object.keys(auth0Environment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, auth0Environment);
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("password reset creates a bounded Management API ticket and emails it to the target", async () => {
  await withResetEnvironment(async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), ...(init ? { init } : {}) });
      return String(url).endsWith("/oauth/token")
        ? Response.json({ access_token: "management-token" })
        : Response.json({ ticket });
    };
    const emails: Array<{ email: string; ticket: string }> = [];
    const result = await sendAuth0PasswordResetEmail(
      "target@example.test",
      async (email, resetTicket) => {
        emails.push({ email, ticket: resetTicket });
      },
    );

    assert.equal(result, undefined);
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, "https://tenant.example.test/oauth/token");
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
      grant_type: "client_credentials",
      client_id: "m2m-client-id",
      client_secret: "m2m-client-secret",
      audience: "https://tenant.example.test/api/v2/",
    });
    assert.equal(
      requests[1]?.url,
      "https://tenant.example.test/api/v2/tickets/password-change",
    );
    assert.equal(
      new Headers(requests[1]?.init?.headers).get("authorization"),
      "Bearer management-token",
    );
    assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
      client_id: "client-id",
      connection_id: "con_database",
      email: "target@example.test",
      ttl_sec: 900,
      mark_email_as_verified: false,
      includeEmailInRedirect: false,
    });
    assert.deepEqual(emails, [{ email: "target@example.test", ticket }]);
  });
});

test("ticket failures never send email or become Sanny authentication failures", async () => {
  await withResetEnvironment(async () => {
    for (const status of [400, 401, 403, 429, 500]) {
      globalThis.fetch = async (url) =>
        String(url).endsWith("/oauth/token")
          ? Response.json({ access_token: "management-token" })
          : Response.json({ ticket: "sensitive-provider-detail" }, { status });
      await assert.rejects(
        sendAuth0PasswordResetEmail("target@example.test", async () => {
          assert.fail("Email must not be sent");
        }),
        (error: unknown) => {
          assert.ok(error instanceof Auth0ManagementError);
          assert.equal(error.statusCode, status);
          assert.ok(!error.message.includes("sensitive-provider-detail"));
          assert.equal(
            createPasswordResetErrorResponse(error).status,
            status === 429 ? 429 : 502,
          );
          return true;
        },
      );
    }
  });
});

test("invalid or untrusted ticket responses never reach the mailer", async () => {
  await withResetEnvironment(async () => {
    for (const body of [
      {},
      null,
      { ticket: 42 },
      { ticket: "not a URL" },
      { ticket: "http://tenant.example.test/reset" },
      { ticket: "https://attacker.example.test/reset" },
      { ticket: "https://user:secret@tenant.example.test/reset" },
      { ticket: "https://tenant.example.test:444/reset" },
    ]) {
      globalThis.fetch = async (url) =>
        String(url).endsWith("/oauth/token")
          ? Response.json({ access_token: "management-token" })
          : Response.json(body);
      await assert.rejects(
        sendAuth0PasswordResetEmail("target@example.test", async () => {
          assert.fail("Email must not be sent");
        }),
        Auth0ManagementError,
      );
    }
  });
});

test("SMTP failure is surfaced without exposing the reset ticket", async () => {
  await withResetEnvironment(async () => {
    globalThis.fetch = async (url) =>
      String(url).endsWith("/oauth/token")
        ? Response.json({ access_token: "management-token" })
        : Response.json({ ticket });
    await assert.rejects(
      sendAuth0PasswordResetEmail("target@example.test", async () => {
        throw new PasswordResetMailError("Email delivery failed");
      }),
      (error: unknown) => {
        assert.ok(error instanceof PasswordResetMailError);
        assert.deepEqual(createPasswordResetErrorResponse(error), {
          status: 503,
          error: "Service unavailable",
          message:
            "Password reset email delivery is unavailable. Contact an administrator.",
        });
        return true;
      },
    );
  });
});

test("missing SMTP settings fail before creating a ticket", async () => {
  await withResetEnvironment(async () => {
    delete process.env.SMTP_PASSWORD;
    globalThis.fetch = async () => {
      assert.fail("Auth0 must not be called");
    };
    await assert.rejects(
      sendAuth0PasswordResetEmail("target@example.test"),
      PasswordResetMailError,
    );
  });
});

test("password reset reports the known MFA configuration failure safely", () => {
  assert.deepEqual(
    createPasswordResetErrorResponse(
      new Auth0ManagementError(
        "MFA customized via PostLogin action but feature is not enabled. access_token=secret",
        400,
      ),
    ),
    {
      status: 502,
      error: "Bad gateway",
      message:
        "Password reset is unavailable because Auth0 MFA is not configured. Contact an administrator.",
    },
  );
});

test("ticket transport and malformed JSON failures are safe provider errors", async () => {
  await withResetEnvironment(async () => {
    for (const malformedResponse of [false, true]) {
      globalThis.fetch = async (url) => {
        if (String(url).endsWith("/oauth/token")) {
          return Response.json({ access_token: "management-token" });
        }
        if (malformedResponse) {
          return new Response("invalid json reset-secret", { status: 200 });
        }
        throw new Error("Network failure reset-secret");
      };
      await assert.rejects(
        sendAuth0PasswordResetEmail("target@example.test", async () => {
          assert.fail("Email must not be sent");
        }),
        (error: unknown) => {
          assert.ok(error instanceof Auth0ManagementError);
          assert.equal(error.statusCode, 502);
          assert.ok(!error.message.includes("reset-secret"));
          return true;
        },
      );
    }
  });
});
