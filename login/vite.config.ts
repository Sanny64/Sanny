import { defineConfig } from "vite";
import { createStylesAlias } from "../vite.shared.ts";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  resolve: {
    alias: createStylesAlias(import.meta.dirname),
  },
});
