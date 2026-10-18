import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import type { SendMailOptions } from "nodemailer";
import {
  getPasswordResetMailConfig,
  PasswordResetMailError,
  sendPasswordResetMail,
} from "../utils/password-reset-mail.js";

const mailEnvironment = {
  SMTP_HOST: "smtp.example.test:587",
  SMTP_USER: "mailer",
  SMTP_PASSWORD: "smtp-secret",
  SMTP_FROM_ADDRESS: "sanny@example.test",
};

async function withMailEnvironment(run: () => Promise<void>) {
  const original = Object.fromEntries(
    Object.keys(mailEnvironment).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, mailEnvironment);
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("SMTP uses verified TLS and parses the existing host:port format", async () => {
  await withMailEnvironment(async () => {
    assert.deepEqual(getPasswordResetMailConfig(), {
      host: "smtp.example.test",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: "mailer", pass: "smtp-secret" },
      from: "sanny@example.test",
    });
    process.env.SMTP_HOST = "smtp.example.test:465";
    assert.equal(getPasswordResetMailConfig().secure, true);
    process.env.SMTP_HOST = "smtp.example.test";
    assert.equal(getPasswordResetMailConfig().port, 587);
    assert.equal(getPasswordResetMailConfig().requireTLS, true);
  });
});

test("SMTP rejects invalid endpoints and sender addresses", async () => {
  await withMailEnvironment(async () => {
    for (const host of [
      "smtp.example.test:0",
      "smtp.example.test:65536",
      "user:pass@smtp.example.test",
      "smtp.example.test/path",
      "smtp.example.test?debug=1",
    ]) {
      process.env.SMTP_HOST = host;
      assert.throws(getPasswordResetMailConfig, PasswordResetMailError);
    }
    process.env.SMTP_HOST = mailEnvironment.SMTP_HOST;
    process.env.SMTP_FROM_ADDRESS =
      "sender@example.test\r\nBcc: attacker@example.test";
    assert.throws(getPasswordResetMailConfig, PasswordResetMailError);
  });
});

test("mailer sends one plain-text reset email and closes its transport", async (context) => {
  await withMailEnvironment(async () => {
    let message: SendMailOptions | undefined;
    let closed = false;
    context.mock.method(nodemailer, "createTransport", () => ({
      sendMail: async (options: SendMailOptions) => {
        message = options;
        return { accepted: ["target@example.test"], rejected: [] };
      },
      close: () => {
        closed = true;
      },
    }));
    const ticket = "https://tenant.example.test/reset?ticket=secret";
    await sendPasswordResetMail("target@example.test", ticket);
    assert.deepEqual(message?.to, { address: "target@example.test", name: "" });
    assert.deepEqual(message?.from, {
      address: "sanny@example.test",
      name: "Sanny",
    });
    assert.ok(String(message?.text).includes(ticket));
    assert.ok(String(message?.text).includes("15 minutes"));
    assert.equal(message?.html, undefined);
    assert.equal(closed, true);
  });
});

test("mailer strips sensitive SMTP errors and closes its transport on failure", async (context) => {
  await withMailEnvironment(async () => {
    let closed = false;
    context.mock.method(nodemailer, "createTransport", () => ({
      sendMail: async () => {
        throw Object.assign(new Error("smtp-secret reset?ticket=secret"), {
          code: "EAUTH",
        });
      },
      close: () => {
        closed = true;
      },
    }));
    await assert.rejects(
      sendPasswordResetMail(
        "target@example.test",
        "https://tenant.example.test/reset?ticket=secret",
      ),
      {
        name: "PasswordResetMailError",
        message: "Password reset email delivery failed (EAUTH)",
      },
    );
    assert.equal(closed, true);
  });
});

test("mailer does not report success if SMTP did not accept the recipient", async (context) => {
  await withMailEnvironment(async () => {
    context.mock.method(nodemailer, "createTransport", () => ({
      sendMail: async () => ({
        accepted: [],
        rejected: ["target@example.test"],
      }),
      close: () => {},
    }));
    await assert.rejects(
      sendPasswordResetMail(
        "target@example.test",
        "https://tenant.example.test/reset",
      ),
      PasswordResetMailError,
    );
  });
});

test("mailer refuses recipient header injection before opening a connection", async (context) => {
  const createTransport = context.mock.method(nodemailer, "createTransport");
  await assert.rejects(
    sendPasswordResetMail(
      "target@example.test\r\nBcc: attacker@example.test",
      "https://tenant.example.test/reset",
    ),
    PasswordResetMailError,
  );
  assert.equal(createTransport.mock.callCount(), 0);
});
