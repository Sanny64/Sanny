import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function recordDocumentationTranslationReview(root, page) {
  const normalizedPage = page.replaceAll('\\', '/');
  if (
    !/\.mdx?$/.test(normalizedPage) ||
    normalizedPage.split('/').includes('..')
  ) {
    throw new Error(
      'Provide a Markdown or MDX path inside apps/documentation/docs'
    );
  }

  const englishRoot = resolve(root, 'apps/documentation/docs');
  const englishPath = resolve(englishRoot, normalizedPage);
  const relativePage = relative(englishRoot, englishPath);
  if (relativePage === '..' || relativePage.startsWith(`..${sep}`)) {
    throw new Error(
      'Documentation page must be inside apps/documentation/docs'
    );
  }

  const germanPath = resolve(
    root,
    'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current',
    normalizedPage
  );
  if (!existsSync(englishPath) || !existsSync(germanPath)) {
    throw new Error(
      `Both English and German pages must exist: ${normalizedPage}`
    );
  }

  const manifestPath = resolve(
    root,
    'apps/documentation/guards/translation-source-hashes.json'
  );
  const reviewedSources = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const digest = createHash('sha256')
    .update(readFileSync(englishPath))
    .digest('hex');
  reviewedSources[normalizedPage] = digest;
  writeFileSync(manifestPath, `${JSON.stringify(reviewedSources, null, 2)}\n`);
  return digest;
}

if (import.meta.main) {
  const page = process.argv[2];
  if (!page || process.argv.length !== 3) {
    console.error('Usage: npm run review:docs -- <docs-relative-path>');
    process.exitCode = 1;
  } else {
    try {
      const root = fileURLToPath(new URL('../../../../', import.meta.url));
      const digest = recordDocumentationTranslationReview(root, page);
      console.log(`Recorded reviewed English source for ${page}: ${digest}`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
