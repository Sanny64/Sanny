import { defineConfig } from "vite";
import { createStylesAlias, createThemeBootstrap } from "../vite.shared.ts";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vite.dev/config/
export default defineConfig({
  plugins: [createThemeBootstrap(), react(), basicSsl()],
  resolve: {
    alias: createStylesAlias(import.meta.dirname),
  },
});
