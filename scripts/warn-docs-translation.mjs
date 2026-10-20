import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function warnDocumentationLineCounts(root, warn = console.warn) {
  const englishRoot = resolve(root, "documentation/docs");
  const germanRoot = resolve(
    root,
    "documentation/i18n/de/docusaurus-plugin-content-docs/current",
  );
  const countLines = (content) =>
    content === ""
      ? 0
      : content.split(/\r\n|\n|\r/).length - Number(/[\r\n]$/.test(content));
  const escapeAnnotation = (value) =>
    value
      .replaceAll("%", "%25")
      .replaceAll("\r", "%0D")
      .replaceAll("\n", "%0A")
      .replaceAll(":", "%3A")
      .replaceAll(",", "%2C");
  let hasDrift = false;

  for (const entry of readdirSync(englishRoot, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) continue;
    const englishPath = resolve(entry.parentPath, entry.name);
    const page = relative(englishRoot, englishPath);
    const germanPath = resolve(germanRoot, page);
    let germanContent;
    try {
      germanContent = readFileSync(germanPath);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const englishContent = readFileSync(englishPath);
    const englishLines = countLines(englishContent.toString("utf8"));
    const germanLines = countLines(germanContent.toString("utf8"));
    const lineDifference = germanLines - englishLines;
    const sizeDifference = germanContent.length - englishContent.length;
    const maxSizeDifference = 2500;
    if (
      Math.abs(lineDifference) >= 1 ||
      sizeDifference >= maxSizeDifference ||
      sizeDifference <= -maxSizeDifference
    ) {
      hasDrift = true;
      const file = page.replaceAll("\\", "/").split("/").slice(-2).join("/");
      warn(
        `::warning title=Translation drift::${escapeAnnotation(file)}: ${sizeDifference > 0 ? "+" : ""}${sizeDifference} bytes, ${lineDifference > 0 ? "+" : ""}${lineDifference} lines (DE - EN)`,
      );
    }
  }

  if (!hasDrift) warn("No drift between locales has been recognized.");
}

if (import.meta.main) {
  warnDocumentationLineCounts(fileURLToPath(new URL("../", import.meta.url)));
}
