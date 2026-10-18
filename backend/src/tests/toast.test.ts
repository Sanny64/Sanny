import test from "node:test";
import assert from "node:assert/strict";
import {
  dismissToast,
  getToasts,
  showToast,
  showErrorToast,
  subscribeToToasts,
} from "../../../shared/packages/ui/src/utils/toast.js";

test("shared toasts support notifications, actions, limits, and dismissal", () => {
  let notifications = 0;
  let actionCalls = 0;
  const unsubscribe = subscribeToToasts(() => notifications++);
  const id = showToast("Save your work", {
    kind: "warning",
    durationMs: 0,
    action: { label: "Sign in", onClick: () => actionCalls++ },
  });
  assert.equal(getToasts()[0]?.kind, "warning");
  getToasts()[0]?.action?.onClick();
  assert.equal(actionCalls, 1);
  dismissToast(id);
  assert.equal(getToasts().length, 0);
  assert.equal(notifications, 2);
  unsubscribe();

  for (let index = 0; index < 6; index++) {
    showToast(`Message ${index}`, { durationMs: 0 });
  }
  assert.equal(getToasts().length, 5);
  assert.equal(getToasts()[0]?.message, "Message 1");
  for (const toast of getToasts()) dismissToast(toast.id);
});

test("shared toasts expire automatically", async () => {
  const id = showToast("Temporary message", { durationMs: 10 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(
    getToasts().some((toast) => toast.id === id),
    false,
  );
});

test("request failures produce one toast with the appropriate severity", () => {
  const cases = [
    {
      error: new Error("Network failure"),
      message: "Network failure",
      kind: "error",
    },
    {
      error: Object.assign(new Error("Please wait"), { status: 429 }),
      message: "Please wait",
      kind: "warning",
    },
    { error: null, message: "Localized fallback", kind: "error" },
  ];

  for (const { error, message, kind } of cases) {
    const id = showErrorToast(error, "Localized fallback");
    assert.equal(getToasts().length, 1);
    assert.equal(getToasts()[0]?.message, message);
    assert.equal(getToasts()[0]?.kind, kind);
    dismissToast(id);
  }
});
