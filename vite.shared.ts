/// <reference types="node" />

import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
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

export function resolveFrontendApiUrl(
  environment: Record<string, string | undefined>,
  mode: string,
  command: "build" | "serve",
) {
  const source =
    mode === "development" || mode === "test"
      ? "VITE_DEV_API_URL"
      : "VITE_PROD_API_URL";
  const value = environment.VITE_API_URL?.trim() || environment[source]?.trim();
  if (!value) throw new Error(`Set VITE_API_URL or ${source}`);

  const url = new URL(value);
  const localHttp =
    command === "serve" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("VITE_API_URL must be an HTTPS origin without credentials");
  }
  return url.origin;
}

export function createFrontendViteConfig() {
  return defineConfig(({ mode, command }) => {
    const apiUrl = resolveFrontendApiUrl(
      loadEnv(mode, process.cwd(), "VITE_"),
      mode,
      command,
    );
    return {
      plugins: [createThemeBootstrap(), react(), basicSsl()],
      define: { "import.meta.env.VITE_API_URL": JSON.stringify(apiUrl) },
    };
  });
}
