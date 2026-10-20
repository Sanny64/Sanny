import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export function warnDocumentationLineCounts(root, warn = console.warn) {
  const englishRoot = resolve(root, "documentation/docs");
  const germanRoot = resolve(
    root,
    "documentation/i18n/de/docusaurus-plugin-content-docs/current",
  );
  const escapeAnnotation = (value) =>
    value
      .replaceAll("%", "%25")
      .replaceAll("\r", "%0D")
      .replaceAll("\n", "%0A")
      .replaceAll(":", "%3A")
      .replaceAll(",", "%2C");
  const maxByteDifference = 3000;
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
    let englishContent;
    try {
      englishContent = readFileSync(englishPath);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const englishSize = englishContent.length;
    const germanSize = germanContent.length;
    const sizeDifference = germanSize - englishSize;
    if (
      sizeDifference >= maxByteDifference ||
      sizeDifference <= -maxByteDifference
    ) {
      hasDrift = true;
      warn(
        `::warning title=Translation byte difference::${escapeAnnotation(page.replaceAll("\\", "/"))}: DE ${germanSize} vs. EN ${englishSize} bytes (${sizeDifference > 0 ? "+" : ""}${sizeDifference})`,
      );
    }
  }

  if (!hasDrift) {
    warn(
      `No translation byte differences of ${maxByteDifference} bytes or more.`,
    );
  }
}

if (import.meta.main) {
  warnDocumentationLineCounts(fileURLToPath(new URL("../", import.meta.url)));
}
