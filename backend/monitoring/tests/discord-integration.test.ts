import assert from "node:assert/strict";
import test from "node:test";

const discordWebhook = process.env.DISCORD_WEBHOOK?.trim();

test(
  "Discord webhook accepts a synthetic monitoring notification",
  { skip: process.env.RUN_DISCORD_INTEGRATION !== "true" },
  async () => {
    assert.ok(discordWebhook, "DISCORD_WEBHOOK must be configured");

    const webhookUrl = new URL(discordWebhook);
    assert.equal(webhookUrl.protocol, "https:");
    assert.ok(
      ["discord.com", "discordapp.com"].includes(webhookUrl.hostname),
      "DISCORD_WEBHOOK must point to a Discord webhook",
    );
    assert.match(webhookUrl.pathname, /^\/api\/webhooks\/\d+\/[^/]+$/);
    assert.equal(webhookUrl.search, "");
    assert.equal(webhookUrl.hash, "");

    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content: `Sanny64 monitoring integration test ${new Date().toISOString()}`,
          allowed_mentions: { parse: [] },
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      assert.fail("Discord webhook request could not be completed");
    }

    assert.equal(
      response.status,
      204,
      "Discord webhook rejected the test message",
    );
  },
);
