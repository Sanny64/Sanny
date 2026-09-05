import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const actionPath = fileURLToPath(
  new URL("../../auth0/post-login/mfaStepUp.js", import.meta.url),
);

type MfaStepUpAction = {
  onExecutePostLogin: (event: object, api: object) => Promise<void>;
};

type MfaOptions = {
  allowRememberBrowser: boolean;
};

async function loadAction() {
  const source = await readFile(actionPath, "utf8");
  const module = { exports: {} as MfaStepUpAction };
  vm.runInNewContext(source, { exports: module.exports });
  return module.exports;
}

test("MFA Action challenges only an explicit MFA step-up request", async () => {
  const action = await loadAction();
  const calls: Array<{ provider: string; options: MfaOptions }> = [];
  const api = {
    multifactor: {
      enable: (provider: string, options: MfaOptions) =>
        calls.push({ provider, options }),
    },
  };

  await action.onExecutePostLogin(
    {
      transaction: { acr_values: [] },
      secrets: {
        MFA_ACR: "http://schemas.openid.net/pape/policies/2007/06/multi-factor",
      },
    },
    api,
  );
  assert.equal(calls.length, 0);

  await action.onExecutePostLogin(
    {
      transaction: {
        acr_values: [
          "http://schemas.openid.net/pape/policies/2007/06/multi-factor",
        ],
      },
      secrets: {
        MFA_ACR: "http://schemas.openid.net/pape/policies/2007/06/multi-factor",
      },
    },
    api,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.provider, "any");
  assert.equal(calls[0]?.options.allowRememberBrowser, false);
});
