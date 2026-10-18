/// <reference types="node" />

import { resolve } from "node:path";
import type { Plugin } from "vite";
import { themeStorageKey } from "./shared/packages/styles/theme.config.ts";

export function createThemeBootstrap(): Plugin {
  return {
    name: "shared-theme-bootstrap",
    transformIndexHtml: {
      order: "pre",
      handler: () => [
        {
          tag: "style",
          children:
            ':root{background:var(--bg,#f5f7f6);color-scheme:light}:root[data-theme="dark"]{background:var(--bg,#151917);color-scheme:dark}',
          injectTo: "head-prepend",
        },
        {
          tag: "script",
          children: `(() => {
  const key = ${JSON.stringify(themeStorageKey)};
  const valid = (value) => value === "light" || value === "dark";
  let theme;
  try {
    const cookie = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(key + "="));
    const value = cookie ? decodeURIComponent(cookie.slice(key.length + 1)) : null;
    if (valid(value)) theme = value;
  } catch {}
  if (!theme) {
    try {
      const value = localStorage.getItem(key);
      if (valid(value)) theme = value;
    } catch {}
  }
  if (!theme) theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
})();`,
          injectTo: "head-prepend",
        },
      ],
    },
  };
}

export function createStylesAlias(appDirectory: string) {
  return {
    "@sanny/styles": resolve(appDirectory, "../shared/packages/styles"), // AIKAIDO
  };
}
