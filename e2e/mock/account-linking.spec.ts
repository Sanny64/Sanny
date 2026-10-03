import { expect, test } from "@playwright/test";

function accountLinkUrl(expiresAt: number, reverse = false): string {
  const primaryUserId = reverse
    ? "auth0|password-user"
    : "google-oauth2|google-user";
  const secondaryUserId = reverse
    ? "google-oauth2|google-user"
    : "auth0|password-user";
  const params = new URLSearchParams({
    primaryUserId,
    secondaryUserId,
    proofUserId: secondaryUserId,
    continuationState: "test-continuation-state",
    proofState: "test-proof-state",
    expiresAt: String(expiresAt),
  });
  return `/confirm-linking?${params.toString()}`;
}

test("shows both accounts and requires ownership authentication", async ({
  page,
}) => {
  await page.goto(accountLinkUrl(Date.now() + 60_000));

  await expect(
    page.getByRole("heading", { name: "Link Your Accounts" }),
  ).toBeVisible();
  await expect(page.getByText("Google", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Email & Password", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("To confirm linking, you will need to re-authenticate"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Authenticate & Continue" }),
  ).toBeEnabled();
});

test("rejects account-link requests with missing parameters", async ({
  page,
}) => {
  await page.goto("/confirm-linking");

  await expect(page.getByRole("heading", { name: "Error" })).toBeVisible();
  await expect(
    page.getByText("Invalid request: missing account-linking parameters"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Return to Login" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Authenticate & Continue" }),
  ).toHaveCount(0);
});

test("shows a recoverable notice when ownership authentication is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.goto(accountLinkUrl(Date.now() + 60_000));

  await page.getByRole("button", { name: "Authenticate & Continue" }).click();

  await expect(page.getByRole("alert")).toContainText("Popup was blocked.");
  await expect(
    page.getByRole("button", { name: "Authenticate & Continue" }),
  ).toBeEnabled();
});

test("recovers when secondary authentication reports an error", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.open = () => ({ closed: false }) as Window;
  });
  await page.goto(accountLinkUrl(Date.now() + 60_000));

  await page.getByRole("button", { name: "Authenticate & Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Completing Authentication" }),
  ).toBeVisible();

  await page.evaluate(() => {
    const channel = new BroadcastChannel("sanny-account-link-proof");
    channel.postMessage({
      type: "error",
      message: "Secondary authentication was cancelled.",
    });
    channel.close();
  });

  await expect(page.getByRole("alert")).toContainText(
    "Secondary authentication was cancelled.",
  );
  await expect(
    page.getByRole("heading", { name: "Completing Authentication" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Authenticate & Continue" }),
  ).toBeEnabled();
});

test("submits successful ownership proofs in both provider directions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.open = () => ({ closed: false }) as Window;
  });
  await page.route("**/api/v001/auth/account-link/continue**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "intercepted",
    }),
  );
  for (const reverse of [false, true]) {
    await page.goto(accountLinkUrl(Date.now() + 60_000, reverse));
    await page.getByRole("button", { name: "Authenticate & Continue" }).click();
    await page.evaluate(() => {
      const channel = new BroadcastChannel("sanny-account-link-proof");
      channel.postMessage({ type: "proof", proof: "synthetic-proof-token" });
      channel.close();
    });
    await page.waitForURL((url) =>
      url.pathname.endsWith("/api/v001/auth/account-link/continue"),
    );

    const continuationUrl = new URL(page.url());
    expect(continuationUrl.searchParams.get("decision")).toBe("confirm");
    expect(continuationUrl.searchParams.get("state")).toBe(
      "test-continuation-state",
    );
    expect(continuationUrl.searchParams.get("proof")).toBe(
      "synthetic-proof-token",
    );
    expect(continuationUrl.searchParams.get("primaryUserId")).toBe(
      reverse ? "auth0|password-user" : "google-oauth2|google-user",
    );
    expect(continuationUrl.searchParams.get("secondaryUserId")).toBe(
      reverse ? "google-oauth2|google-user" : "auth0|password-user",
    );
  }
});

test("submits cancellation without an ownership proof", async ({ page }) => {
  await page.route("**/api/v001/auth/account-link/continue**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "intercepted",
    }),
  );
  await page.goto(accountLinkUrl(Date.now() + 60_000));

  await page.getByRole("button", { name: "Return to login" }).click();
  await page.waitForURL((url) =>
    url.pathname.endsWith("/api/v001/auth/account-link/continue"),
  );

  const continuationUrl = new URL(page.url());
  expect(continuationUrl.searchParams.get("decision")).toBe("cancel");
  expect(continuationUrl.searchParams.get("state")).toBe(
    "test-continuation-state",
  );
  expect(continuationUrl.searchParams.has("proof")).toBe(false);
});

test("ignores ownership proofs received from untrusted window origins", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.open = () => ({ closed: false }) as Window;
  });
  await page.route("**/api/v001/auth/account-link/continue**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "intercepted",
    }),
  );
  await page.goto(accountLinkUrl(Date.now() + 60_000));

  await page.getByRole("button", { name: "Authenticate & Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Completing Authentication" }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://attacker.example",
        data: { type: "proof", proof: "untrusted-proof-token" },
      }),
    );
  });

  await expect(
    page.getByRole("heading", { name: "Completing Authentication" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/confirm-linking\?/);
});

test("disables confirmation for an expired account-link request", async ({
  page,
}) => {
  await page.goto(accountLinkUrl(Date.now() - 1_000));

  await expect(
    page.getByText("This linking request has expired."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request expired" }),
  ).toBeDisabled();
});

test("ignores ownership proof messages after the request expires", async ({
  page,
}) => {
  await page.route("**/api/v001/auth/account-link/continue**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "intercepted",
    }),
  );
  await page.goto(accountLinkUrl(Date.now() - 1_000));

  await expect(
    page.getByText("This linking request has expired."),
  ).toBeVisible();
  await page.evaluate(() => {
    const channel = new BroadcastChannel("sanny-account-link-proof");
    channel.postMessage({ type: "proof", proof: "late-proof-token" });
    channel.close();
  });

  await expect(
    page.getByText("This linking request has expired."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request expired" }),
  ).toBeDisabled();
});

test("ignores malformed ownership proof messages", async ({ page }) => {
  await page.addInitScript(() => {
    window.open = () => ({ closed: false }) as Window;
  });
  await page.route("**/api/v001/auth/account-link/continue**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "intercepted",
    }),
  );
  await page.goto(accountLinkUrl(Date.now() + 60_000));

  await page.getByRole("button", { name: "Authenticate & Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Completing Authentication" }),
  ).toBeVisible();
  await page.evaluate(() => {
    const channel = new BroadcastChannel("sanny-account-link-proof");
    channel.postMessage({ type: "proof", proof: 123 });
    channel.close();
  });

  await expect(
    page.getByRole("heading", { name: "Completing Authentication" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/confirm-linking\?/);
});

test("accepts ownership proofs received from the same window origin", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.open = () => ({ closed: false }) as Window;
  });
  await page.route("**/api/v001/auth/account-link/continue**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "intercepted",
    }),
  );
  await page.goto(accountLinkUrl(Date.now() + 60_000));

  await page.getByRole("button", { name: "Authenticate & Continue" }).click();
  await page.evaluate(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: window.location.origin,
        data: { type: "proof", proof: "same-origin-proof-token" },
      }),
    );
  });
  await page.waitForURL((url) =>
    url.pathname.endsWith("/api/v001/auth/account-link/continue"),
  );

  expect(new URL(page.url()).searchParams.get("proof")).toBe(
    "same-origin-proof-token",
  );
});

test("shows an error and stays local for an invalid proof-resume state", async ({
  page,
}) => {
  const params = new URLSearchParams({
    state: "invalid-state",
    expiresAt: String(Date.now() + 60_000),
  });
  await page.goto(`/account-link-proof-resume#${params.toString()}`);

  await expect(page.getByRole("alert")).toContainText(
    "This account verification has expired or is unavailable.",
  );
  await expect(page).toHaveURL(/\/account-link-proof-resume#/);
});

test("shows an explicit error when proof-resume storage is blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem() {
          throw new Error("Storage is blocked");
        },
        setItem() {
          throw new Error("Storage is blocked");
        },
        removeItem() {
          throw new Error("Storage is blocked");
        },
      },
    });
  });
  await page.goto("/account-link-proof-resume");

  await expect(page.getByRole("alert")).toContainText(
    "Account verification could not be resumed. Allow browser storage",
  );
  await expect(page).toHaveURL(/\/account-link-proof-resume$/);
});

test("resumes a valid proof state through the backend start endpoint", async ({
  page,
}) => {
  const state = "a".repeat(43);
  const expiresAt = Date.now() + 60_000;
  const params = new URLSearchParams({ state, expiresAt: String(expiresAt) });
  await page.route("**/api/v001/auth/account-link-proof/start**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "intercepted",
    }),
  );
  await page.goto(`/account-link-proof-resume#${params.toString()}`);
  await page.waitForURL((url) =>
    url.pathname.endsWith("/api/v001/auth/account-link-proof/start"),
  );

  expect(new URL(page.url()).searchParams.get("state")).toBe(state);
});

test("rejects an expired proof-resume state without redirecting", async ({
  page,
}) => {
  const params = new URLSearchParams({
    state: "a".repeat(43),
    expiresAt: String(Date.now() - 1_000),
  });
  await page.goto(`/account-link-proof-resume#${params.toString()}`);

  await expect(page.getByRole("alert")).toContainText(
    "This account verification has expired or is unavailable.",
  );
  await expect(page).toHaveURL(/\/account-link-proof-resume#/);
});

test("restores a pending proof state from session storage after reload", async ({
  page,
}) => {
  const state = "b".repeat(43);
  await page.addInitScript((pendingState) => {
    sessionStorage.setItem(
      "sanny-account-link-proof-resume",
      JSON.stringify({ state: pendingState, expiresAt: Date.now() + 60_000 }),
    );
  }, state);
  await page.route("**/api/v001/auth/account-link-proof/start**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "intercepted",
    }),
  );
  await page.goto("/account-link-proof-resume");
  await page.waitForURL((url) =>
    url.pathname.endsWith("/api/v001/auth/account-link-proof/start"),
  );

  expect(new URL(page.url()).searchParams.get("state")).toBe(state);
});

test("clears expired proof state from session storage", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "sanny-account-link-proof-resume",
      JSON.stringify({ state: "c".repeat(43), expiresAt: Date.now() - 1_000 }),
    );
  });
  await page.goto("/account-link-proof-resume");

  await expect(page.getByRole("alert")).toContainText(
    "This account verification has expired or is unavailable.",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("sanny-account-link-proof-resume"),
      ),
    )
    .toBeNull();
  await expect(page).toHaveURL(/\/account-link-proof-resume$/);
});

test("starts normal authentication when no proof state is pending", async ({
  page,
}) => {
  await page.route("**/api/v001/auth", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "intercepted",
    }),
  );
  await page.goto("/account-link-proof-resume");
  await page.waitForURL((url) => url.pathname.endsWith("/api/v001/auth"));

  expect(new URL(page.url()).pathname).toMatch(/\/api\/v001\/auth$/);
});

test("clears malformed proof state from session storage", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("sanny-account-link-proof-resume", "not-json");
  });
  await page.goto("/account-link-proof-resume");

  await expect(page.getByRole("alert")).toContainText(
    "This account verification has expired or is unavailable.",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("sanny-account-link-proof-resume"),
      ),
    )
    .toBeNull();
  await expect(page).toHaveURL(/\/account-link-proof-resume$/);
});

test("broadcasts a completed proof and clears its resume state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "sanny-account-link-proof-resume",
      JSON.stringify({ state: "d".repeat(43), expiresAt: Date.now() + 60_000 }),
    );
    const channel = new BroadcastChannel("sanny-account-link-proof");
    channel.addEventListener("message", ({ data }) => {
      document.documentElement.dataset.proofMessage = JSON.stringify(data);
    });
  });
  await page.goto("/account-link-proof-complete#proof=synthetic-proof-token");

  await expect(
    page.getByText("Completing account verification..."),
  ).toBeVisible();
  await expect
    .poll(() => page.locator("html").getAttribute("data-proof-message"))
    .toBe(JSON.stringify({ type: "proof", proof: "synthetic-proof-token" }));
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("sanny-account-link-proof-resume"),
      ),
    )
    .toBeNull();
});

test("broadcasts proof errors without clearing the pending resume state", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "sanny-account-link-proof-resume",
      JSON.stringify({ state: "e".repeat(43), expiresAt: Date.now() + 60_000 }),
    );
    const channel = new BroadcastChannel("sanny-account-link-proof");
    channel.addEventListener("message", ({ data }) => {
      document.documentElement.dataset.proofMessage = JSON.stringify(data);
    });
  });
  await page.goto(
    "/account-link-proof-complete#error=Secondary%20authentication%20failed",
  );

  await expect
    .poll(() => page.locator("html").getAttribute("data-proof-message"))
    .toBe(
      JSON.stringify({
        type: "error",
        message: "Secondary authentication failed",
      }),
    );
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("sanny-account-link-proof-resume"),
      ),
    )
    .toContain('"state":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"');
});
