import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dts from "vite-plugin-dts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [dts({ include: ["src", "../../../global.d.ts"] })],
  resolve: {
    alias: {
      "@sanny/styles": resolve(__dirname, "../styles/index.ts"),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "SannyUI",
      fileName: "sanny-ui",
    },
  },
});
