import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { dismissToast, getToasts } from "../utils/toast";

afterEach(() => {
  cleanup();
  for (const toast of getToasts()) dismissToast(toast.id);
  localStorage.clear();
  document.cookie = "language=; Max-Age=0; path=/";
  document.cookie = "theme=; Max-Age=0; path=/";
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("lang");
  document.documentElement.classList.remove("dark");
});
