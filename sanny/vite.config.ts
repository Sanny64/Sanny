import { defineConfig } from "vite";
import { createStylesAlias } from "../vite.shared.ts";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: createStylesAlias(import.meta.dirname),
  },
});
