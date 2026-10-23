import assert from 'node:assert/strict';
import {
  readFileSync,
  existsSync,
  readdirSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import * as prettier from 'prettier';
import { ESLint } from 'eslint';
import { parse } from 'yaml';
import ts from 'typescript';
import browserConfig from '../e2e/playwright.mocked.config.ts';
import baseBrowserConfig from '../../../playwright.config.ts';
import docsBrowserConfig from '../e2e/playwright.docs.config.ts';
import authVitestConfig from '../../../apps/frontend/auth/vitest.config.ts';
import frontendVitestConfig from '../../../apps/frontend/vitest.config.ts';
import sannyVitestConfig from '../../../apps/frontend/sanny/vitest.config.ts';
import uiVitestConfig from '../../../shared/packages/ui/vitest.config.ts';
import { resolveFrontendApiUrl } from '../../../apps/frontend/vite.config.ts';
import { createTestRules } from '../../../tooling/scripts/run-integration.mjs';
import {
  BACKEND_DEPENDENT_SCRIPTS,
  E2E_GATE_SCRIPTS,
  FULL_GATE_SCRIPTS,
  LIVE_GATE_SCRIPTS,
  MONITORING_GATE_SCRIPTS,
  PLAYWRIGHT_GATE_ARGS,
  backendHealthUrl,
  newlyStartedServices,
  waitForBackendReady,
} from '../../../tooling/scripts/run-test-with-stopwatch.mjs';
import { selectStaleTestProjects } from '../../../tooling/scripts/stale-test-projects.mjs';
import { createRedisTestCertificates } from '../../../tooling/scripts/run-redis-tests.mjs';
import { readFile, rm } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import { assertRuntime } from '../../../tooling/scripts/check-runtime.mjs';
import { deploymentTargets } from '../../../tooling/scripts/deployment-targets.mjs';
import { recordDocumentationTranslationReview } from '../../../tooling/scripts/record-doc-translation-review.mjs';
import { warnDocumentationLineCounts } from '../../../tooling/scripts/warn-docs-translation.mjs';
import {
  visualDependencyImage,
  visualWorkspaceFiles,
} from '../../../tooling/scripts/run-test-linux-visual.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const sharedPackages = ['i18n', 'styles', 'ui'];

test('the backend application has no misleading package entrypoint', () => {
  assert.equal(json('apps/backend/package.json').main, undefined);
});

test('English and German documentation contain the same pages', () => {
  const listPages = (directory) =>
    readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        if (entry.isDirectory()) {
          return listPages(resolve(directory, entry.name)).map(
            (page) => `${entry.name}/${page}`
          );
        }
        return entry.isFile() && /\.mdx?$/.test(entry.name) ? [entry.name] : [];
      })
      .sort();
  const english = listPages(resolve(root, 'apps/documentation/docs'));
  const german = listPages(
    resolve(
      root,
      'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current'
    )
  );

  assert.deepEqual(
    german,
    english,
    'German docs must contain the same Markdown and MDX pages as English docs'
  );

  const missingReferences = english.flatMap((page) => {
    const englishContent = read(`apps/documentation/docs/${page}`).replace(
      /^[ \t]*```[^\n]*\r?\n[\s\S]*?^[ \t]*```[ \t]*$/gm,
      ''
    );
    const germanContent = read(
      `apps/documentation/i18n/de/docusaurus-plugin-content-docs/current/${page}`
    );
    const germanCodeBlocks = [
      ...germanContent.matchAll(
        /^[ \t]*```[^\n]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm
      ),
    ].map((match) => match[1]);
    const germanInlineReferences = [
      ...germanContent
        .replace(/^[ \t]*```[^\n]*\r?\n[\s\S]*?^[ \t]*```[ \t]*$/gm, '')
        .matchAll(/`([^`\n]+)`/g),
    ].map((match) => match[1]);
    const germanCode = [...germanCodeBlocks, ...germanInlineReferences]
      .join(' ')
      .replace(/\s+/g, ' ');

    return [...englishContent.matchAll(/`([^`\n]+)`/g)]
      .map((match) => match[1])
      .filter((reference) => !reference.startsWith('http'))
      .filter((reference) => {
        const identifier = reference.includes('=')
          ? reference.slice(0, reference.indexOf('='))
          : reference;
        return !germanCode.includes(identifier.replace(/\s+/g, ' '));
      })
      .map((reference) => `${page}: ${reference}`);
  });

  assert.deepEqual(
    missingReferences,
    [],
    'German docs must retain inline technical references from English docs'
  );

  const reviewedSources = json(
    'apps/documentation/guards/translation-source-hashes.json'
  );
  assert.deepEqual(
    Object.keys(reviewedSources).sort(),
    english,
    'Every German page must record the English source revision it was reviewed against'
  );
  const staleTranslations = english.filter((page) => {
    const digest = createHash('sha256')
      .update(read(`apps/documentation/docs/${page}`))
      .digest('hex');
    return reviewedSources[page] !== digest;
  });
  assert.deepEqual(
    staleTranslations,
    [],
    'Review the German page and update its source hash after changing English content'
  );
});

test('English and German documentation use matching heading levels', () => {
  const listPages = (directory) =>
    readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        if (entry.isDirectory()) {
          return listPages(resolve(directory, entry.name)).map(
            (page) => `${entry.name}/${page}`
          );
        }
        return entry.isFile() && /\.mdx?$/.test(entry.name) ? [entry.name] : [];
      })
      .sort();
  const englishRoot = resolve(root, 'apps/documentation/docs');
  const germanRoot = resolve(
    root,
    'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current'
  );
  const headingLevels = (content) =>
    content
      .replace(/^[ \t]*```[^\n]*\r?\n[\s\S]*?^[ \t]*```[ \t]*$/gm, '')
      .match(/^[ \t]{0,3}(#{1,6})(?:[ \t]+|$)/gm)
      ?.map((heading) => heading.trim().match(/^#+/)[0].length) ?? [];
  const mismatches = listPages(englishRoot).flatMap((page) => {
    const englishHeadings = headingLevels(
      readFileSync(resolve(englishRoot, page), 'utf8')
    );
    const germanHeadings = headingLevels(
      readFileSync(resolve(germanRoot, page), 'utf8')
    );
    return JSON.stringify(germanHeadings) === JSON.stringify(englishHeadings)
      ? []
      : [
          `${page}: EN ${englishHeadings.join(', ')} vs. DE ${germanHeadings.join(', ')}`,
        ];
  });

  assert.deepEqual(
    mismatches,
    [],
    'German pages must preserve the ordered heading levels of their English source'
  );
});

test('German documentation separates every section and ends with a dated edit footer', () => {
  const germanRoot = resolve(
    root,
    'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current'
  );
  const violations = [];

  for (const entry of readdirSync(germanRoot, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) continue;
    const filePath = resolve(entry.parentPath, entry.name);
    const page = relative(germanRoot, filePath).replaceAll('\\', '/');
    const content = readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const headings = [];
    let inCodeBlock = false;

    lines.forEach((line, index) => {
      if (/^[ \t]*```/.test(line)) {
        inCodeBlock = !inCodeBlock;
      } else if (!inCodeBlock && /^##[ \t]+/.test(line)) {
        headings.push({ index, title: line.trim() });
      }
    });

    for (let index = 0; index < headings.length - 1; index += 1) {
      const boundary = headings[index + 1].index;
      if (
        lines[boundary - 1] !== '' ||
        lines[boundary - 2] !== '---' ||
        lines[boundary - 3] !== ''
      ) {
        violations.push(
          `${page}: missing \n\n---\n\n after ${headings[index].title}`
        );
      }
    }

    const footer = content.match(
      /\r?\n\r?\n---[ \t]*\r?\n\r?\n(?:Letzte Bearbeitung|Last edit): (\d{2})\.(\d{2})\.(\d{4})\r?\n$/
    );
    if (!footer) {
      violations.push(`${page}: missing the required dated edit footer at EOF`);
      continue;
    }

    const [, day, month, year] = footer;
    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day))
    );
    if (
      Number(year) < 1 ||
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
    ) {
      violations.push(`${page}: edit footer contains an invalid calendar date`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    'Every German documentation section must be separated and every page must end with a valid edit date'
  );
});

test('English and German documentation contain the exact same line counts', () => {
  const listPages = (directory) =>
    readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        if (entry.isDirectory()) {
          return listPages(resolve(directory, entry.name)).map(
            (page) => `${entry.name}/${page}`
          );
        }
        return entry.isFile() && /\.mdx?\$/.test(entry.name)
          ? [entry.name]
          : [];
      })
      .sort();

  const englishRoot = resolve(root, 'apps/documentation/docs');
  const germanRoot = resolve(
    root,
    'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current'
  );

  const mismatches = listPages(englishRoot).flatMap((page) => {
    const englishContent = readFileSync(resolve(englishRoot, page), 'utf8');
    const germanContent = readFileSync(resolve(germanRoot, page), 'utf8');

    // Split by cross-platform carriage returns to get accurate line items
    const englishLines = englishContent.split(/\r?\n/).length;
    const germanLines = germanContent.split(/\r?\n/).length;

    return englishLines === germanLines
      ? []
      : [
          `${page}: EN has ${englishLines} lines vs. DE has ${germanLines} lines`,
        ];
  });

  assert.deepEqual(
    mismatches,
    [],
    'German documentation pages must have the exact same line count as their English counterparts'
  );
});

test('Dokumente erfüllen die strikten Titel- und Abstandsregeln nach dem Frontmatter', () => {
  const listPages = (directory) =>
    readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        if (entry.isDirectory()) {
          return listPages(resolve(directory, entry.name)).map(
            (page) => `${entry.name}/${page}`
          );
        }
        return entry.isFile() && /\.mdx?\$/.test(entry.name)
          ? [entry.name]
          : [];
      })
      .sort();

  const englishRoot = resolve(root, 'apps/documentation/docs');
  const germanRoot = resolve(
    root,
    'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current'
  );

  const violations = [];

  const checkFileRules = (filePath, relativePagePath) => {
    const content = readFileSync(filePath, 'utf8');

    // Match Frontmatter-Inhalt zwischen den ersten beiden "---"
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) return; // Überspringen, falls kein Frontmatter existiert

    const frontmatterRaw = frontmatterMatch[1];
    const frontmatterEndIndex = frontmatterMatch[0].length;

    // Extrahiere den reinen Text NACH dem schließenden "---"
    const contentAfterFrontmatter = content.slice(frontmatterEndIndex);

    // Parse den Titel aus dem Frontmatter
    const titleMatch = frontmatterRaw.match(/^title:\s*(.+)\$/m);
    const frontmatterTitle = titleMatch
      ? titleMatch[1].trim().replace(/^['"]|['"]\$/g, '')
      : null;

    // Finde die allererste Überschrift (egal ob #, ##, etc.) nach dem Frontmatter
    const lines = contentAfterFrontmatter.split(/\r?\n/);
    let firstHeadingLineIndex = -1;
    let headingText = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^#{1,6}\s+/.test(line)) {
        firstHeadingLineIndex = i;
        headingText = line.replace(/^#+\s+/, '').trim();
        break;
      }
    }

    if (firstHeadingLineIndex !== -1) {
      // REGEL 1: Leerraum zwischen "---" und der ersten Überschrift erzwingen
      // lines[0] ist die direkte Zeile nach dem "---". Sie darf kein Heading sein.
      // Zudem muss mindestens eine echte Leerzeile (oder nur Whitespace) dazwischen liegen.
      if (firstHeadingLineIndex === 0) {
        violations.push(
          `${relativePagePath}: Kein Abstand (Leerzeile) zwischen dem schließenden '---' und der ersten Überschrift.`
        );
      } else {
        // Prüfen, ob alle Zeilen vor der Überschrift leer sind (mindestens eine erforderlich)
        const leadingBlock = lines.slice(0, firstHeadingLineIndex);
        const hasEmptyLine = leadingBlock.some((l) => l.trim() === '');
        if (!hasEmptyLine) {
          violations.push(
            `${relativePagePath}: Es muss mindestens eine leere Zeile Platz zwischen '---' und der ersten Überschrift sein.`
          );
        }
      }

      // REGEL 2: Doppelter Titel verboten (Frontmatter-Titel darf NICHT exakt als H1/#-Überschrift wiederholt werden)
      if (frontmatterTitle && headingText === frontmatterTitle) {
        violations.push(
          `${relativePagePath}: Der Titel '${frontmatterTitle}' aus dem Frontmatter darf nicht identisch als Überschrift wiederholt werden.`
        );
      }
    }
  };

  // Führe die Prüfung für englische und deutsche Dokumente aus
  listPages(englishRoot).forEach((page) =>
    checkFileRules(resolve(englishRoot, page), `EN: ${page}`)
  );
  listPages(germanRoot).forEach((page) =>
    checkFileRules(resolve(germanRoot, page), `DE: ${page}`)
  );

  assert.deepEqual(
    violations,
    [],
    'Dokumente verstoßen gegen die Formatierungsregeln für Titel und Abstände.'
  );
});

test('English and German documentation use matching special character counts', () => {
  const englishRoot = resolve(root, 'apps/documentation/docs');
  const germanRoot = resolve(
    root,
    'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current'
  );
  const characters = [...'`#*[]{}<>|~'];
  const countCharacters = (content) =>
    characters.map((character) => content.split(character).length - 1);

  assert.deepEqual(
    countCharacters('# `English` [text](url)'),
    countCharacters(
      '# `Deutsch` [\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df](url)'
    )
  );
  for (const character of characters) {
    assert.notDeepEqual(countCharacters(character), countCharacters(''));
  }

  const mismatches = [];
  for (const entry of readdirSync(englishRoot, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) continue;
    const englishPath = resolve(entry.parentPath, entry.name);
    const page = relative(englishRoot, englishPath).replaceAll('\\', '/');
    const germanPath = resolve(germanRoot, page);
    if (!existsSync(germanPath)) {
      mismatches.push(`${page}: missing German page`);
      continue;
    }
    const englishCounts = countCharacters(readFileSync(englishPath, 'utf8'));
    const germanCounts = countCharacters(readFileSync(germanPath, 'utf8'));
    characters.forEach((character, index) => {
      if (englishCounts[index] !== germanCounts[index]) {
        mismatches.push(
          `${page}: ${JSON.stringify(character)} EN ${englishCounts[index]} vs. DE ${germanCounts[index]}`
        );
      }
    });
  }

  assert.deepEqual(
    mismatches,
    [],
    'German pages must preserve each language-independent Markdown symbol count from English'
  );
});

test('German documentation contains no malformed German special characters', () => {
  const germanRoot = resolve(
    root,
    'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current'
  );
  const germanCharacters = [
    ...'\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df\u1e9e',
  ];
  const legacyDecoder = new TextDecoder('windows-1252');
  const malformedCharacters = new Set([
    '\ufffd',
    ...germanCharacters.flatMap((character) => {
      const bytes = Buffer.from(character, 'utf8');
      return [bytes.toString('latin1'), legacyDecoder.decode(bytes)];
    }),
  ]);
  const findMalformedCharacters = (content) =>
    [...malformedCharacters].filter((character) => content.includes(character));
  const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

  assert.deepEqual(findMalformedCharacters(germanCharacters.join('')), []);
  for (const character of malformedCharacters) {
    assert.ok(findMalformedCharacters(`Text ${character} Text`).length > 0);
  }
  assert.throws(() => utf8Decoder.decode(Buffer.from([0xc3, 0x28])));

  const malformed = [];
  for (const entry of readdirSync(germanRoot, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !/\.(?:mdx?|json)$/.test(entry.name)) continue;
    const path = resolve(entry.parentPath, entry.name);
    const page = relative(germanRoot, path).replaceAll('\\', '/');
    let content;
    try {
      content = utf8Decoder.decode(readFileSync(path));
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      malformed.push(`${page}: invalid UTF-8`);
      continue;
    }
    content.split(/\r\n|\n|\r/).forEach((line, index) => {
      for (const character of findMalformedCharacters(line)) {
        malformed.push(`${page}:${index + 1}: ${JSON.stringify(character)}`);
      }
    });
  }

  assert.deepEqual(
    malformed,
    [],
    'German documentation must retain valid UTF-8 without replacement characters or mojibake'
  );
});

test('English documentation has unique sidebar positions within each folder', () => {
  const docsRoot = resolve(root, 'apps/documentation/docs');
  const positionsByFolder = new Map();
  const addPosition = (folder, position, page) => {
    if (position === undefined || position === null) return;
    const positions = positionsByFolder.get(folder) ?? new Map();
    const previousPage = positions.get(position);
    assert.equal(
      previousPage,
      undefined,
      `Duplicate sidebar position ${position} in ${folder || '.'}: ${previousPage} and ${page}`
    );
    positions.set(position, page);
    positionsByFolder.set(folder, positions);
  };
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.name === '_category_.json') {
        const category = JSON.parse(readFileSync(path, 'utf8'));
        const parentFolder = relative(docsRoot, dirname(directory)).replaceAll(
          '\\',
          '/'
        );
        addPosition(parentFolder, category.position, relative(docsRoot, path));
      } else if (entry.isFile() && /\.mdx?$/.test(entry.name)) {
        const contents = readFileSync(path, 'utf8');
        const frontmatter = contents.match(
          /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
        );
        if (!frontmatter) continue;
        const metadata = parse(frontmatter[1]) ?? {};
        const folder = relative(docsRoot, directory).replaceAll('\\', '/');
        addPosition(
          folder,
          metadata.sidebar_position,
          relative(docsRoot, path)
        );
      }
    }
  };

  visit(docsRoot);
});

test('English and German documentation have matching sidebar positions', () => {
  const englishRoot = resolve(root, 'apps/documentation/docs');
  const germanRoot = resolve(
    root,
    'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current'
  );
  const listFiles = (directory, filter) =>
    readdirSync(directory, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && filter(entry.name))
      .map((entry) =>
        relative(directory, resolve(entry.parentPath, entry.name)).replaceAll(
          '\\',
          '/'
        )
      )
      .sort();
  const sidebarPosition = (content) => {
    const frontmatter = content.match(
      /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
    );
    return frontmatter
      ? (parse(frontmatter[1]) ?? {}).sidebar_position
      : undefined;
  };

  for (const page of listFiles(englishRoot, (name) => /\.mdx?$/.test(name))) {
    const englishPosition = sidebarPosition(
      readFileSync(resolve(englishRoot, page), 'utf8')
    );
    const germanPosition = sidebarPosition(
      readFileSync(resolve(germanRoot, page), 'utf8')
    );
    assert.equal(
      germanPosition,
      englishPosition,
      `${page}: German sidebar_position must match English`
    );
  }

  const categoryFilter = (name) => name === '_category_.json';
  const englishCategories = listFiles(englishRoot, categoryFilter);
  const germanCategories = listFiles(germanRoot, categoryFilter);
  assert.deepEqual(
    germanCategories,
    englishCategories,
    'English and German documentation must contain the same sidebar categories'
  );
  for (const category of englishCategories) {
    const englishPosition = JSON.parse(
      readFileSync(resolve(englishRoot, category), 'utf8')
    ).position;
    const germanPosition = JSON.parse(
      readFileSync(resolve(germanRoot, category), 'utf8')
    ).position;
    assert.equal(
      germanPosition,
      englishPosition,
      `${category}: German category position must match English`
    );
  }
});

test('documentation byte-size differences emit the only comparison warnings', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'docs-translation-lines-'));
  const english = resolve(fixture, 'apps/documentation/docs');
  const german = resolve(
    fixture,
    'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current'
  );
  try {
    for (const directory of [english, german]) {
      mkdirSync(resolve(directory, 'nested'), { recursive: true });
      writeFileSync(resolve(directory, 'empty.md'), '');
      writeFileSync(resolve(directory, 'ignored.json'), '{}');
    }
    writeFileSync(resolve(english, 'equal.md'), 'one\ntwo\n');
    writeFileSync(resolve(german, 'equal.md'), 'eins\r\nzwei');
    writeFileSync(resolve(english, 'nested/lines-only.mdx'), 'a');
    writeFileSync(resolve(german, 'nested/lines-only.mdx'), 'a\nb\nc');
    for (const [page, content] of [
      ['at-byte-limit.md', 'a'.repeat(3001)],
      ['over-byte-limit.md', 'a'.repeat(3002)],
      ['below-byte-limit.md', 'a'.repeat(3000)],
    ]) {
      writeFileSync(resolve(english, page), 'a');
      writeFileSync(resolve(german, page), content);
    }
    writeFileSync(resolve(english, 'unicode.md'), '');
    writeFileSync(resolve(german, 'unicode.md'), '\u00e4'.repeat(1500));
    writeFileSync(resolve(english, 'missing.md'), 'not translated\n');
    const warnings = [];
    warnDocumentationLineCounts(fixture, (warning) => warnings.push(warning));
    assert.deepEqual(warnings, [
      '::warning title=Translation byte difference::at-byte-limit.md: DE 3001 vs. EN 1 bytes (+3000)',
      '::warning title=Translation byte difference::over-byte-limit.md: DE 3002 vs. EN 1 bytes (+3001)',
      '::warning title=Translation byte difference::unicode.md: DE 3000 vs. EN 0 bytes (+3000)',
    ]);
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { warnDocumentationLineCounts } from ${JSON.stringify(new URL('../../../tooling/scripts/warn-docs-translation.mjs', import.meta.url).href)}; warnDocumentationLineCounts(${JSON.stringify(fixture)});`,
      ],
      { encoding: 'utf8', cwd: fixture }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stderr,
      /at-byte-limit\.md: DE 3001 vs\. EN 1 bytes \(\+3000\)/
    );
    assert.doesNotMatch(result.stderr, /lines-only\.md/);
    assert.doesNotMatch(result.stderr, /below-byte-limit\.md/);
    const matchingWarnings = [];
    writeFileSync(resolve(german, 'at-byte-limit.md'), 'a');
    writeFileSync(resolve(german, 'over-byte-limit.md'), 'a');
    writeFileSync(resolve(german, 'unicode.md'), '');
    warnDocumentationLineCounts(fixture, (warning) =>
      matchingWarnings.push(warning)
    );
    assert.deepEqual(matchingWarnings, [
      'No translation byte differences of 3000 bytes or more.',
    ]);

    const workflow = parse(read('.github/workflows/verify.yml'));
    assert.equal(
      workflow.jobs.verify.steps.some(
        (entry) =>
          entry.run === 'node tooling/scripts/run-test-docs-translation.mjs'
      ),
      false,
      'test:ci owns the docs comparison so CI does not run it twice'
    );
    assert.ok(
      json('package.json').scripts['test:ci'].includes('npm run test:tooling')
    );
    assert.ok(
      json('package.json').scripts['test:ci'].includes('npm run compare:docs')
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('translation review records only a paired page source hash', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'docs-translation-review-'));
  const english = resolve(fixture, 'apps/documentation/docs/guide.mdx');
  const german = resolve(
    fixture,
    'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current/guide.mdx'
  );
  const manifest = resolve(
    fixture,
    'apps/documentation/guards/translation-source-hashes.json'
  );
  try {
    mkdirSync(resolve(english, '..'), { recursive: true });
    mkdirSync(resolve(german, '..'), { recursive: true });
    mkdirSync(resolve(manifest, '..'), { recursive: true });
    writeFileSync(english, '## English source\n');
    writeFileSync(german, '## Deutscher Text\n');
    writeFileSync(manifest, '{}\n');

    const digest = recordDocumentationTranslationReview(fixture, 'guide.mdx');
    assert.equal(
      JSON.parse(readFileSync(manifest, 'utf8'))['guide.mdx'],
      digest
    );
    assert.equal(
      digest,
      createHash('sha256').update('## English source\n').digest('hex')
    );
    assert.equal(readFileSync(german, 'utf8'), '## Deutscher Text\n');
    assert.throws(
      () => recordDocumentationTranslationReview(fixture, '../outside.mdx'),
      /inside apps\/documentation\/docs/
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('release planning preserves branch and target boundaries', () => {
  assert.equal(
    deploymentTargets(['apps/backend/src/server.ts'], 'main').backend,
    true
  );
  assert.equal(
    deploymentTargets(['apps/backend/src/server.ts'], 'main').auth,
    false
  );
  assert.equal(
    deploymentTargets(['apps/frontend/auth/src/App.tsx'], 'main').auth,
    true
  );
  assert.equal(
    deploymentTargets(['apps/frontend/auth/src/App.tsx'], 'main').backend,
    false
  );
  for (const path of [
    'apps/frontend/frontend-env.d.ts',
    'tooling/config/.nvmrc',
    'shared/tests/contracts/config.test.mjs',
    'shared/tests/e2e/playwright.mocked.config.ts',
    'apps/frontend/tsconfig.frontend.json',
    'tsconfig.json',
  ]) {
    const targets = deploymentTargets([path], 'main');
    for (const name of ['auth', 'sanny', 'docs', 'backend'])
      assert.equal(targets[name], true);
  }
  for (const path of [
    'apps/frontend/assets.d.ts',
    'apps/frontend/tests/frontend-feedback.test.ts',
    'apps/frontend/tests/account-linking-routes.test.ts',
    'apps/frontend/vite.config.ts',
    'apps/frontend/vitest.config.ts',
  ]) {
    const targets = deploymentTargets([path], 'main');
    assert.equal(targets.auth, true, path);
    assert.equal(targets.sanny, true, path);
    assert.equal(targets.docs, false, path);
    assert.equal(targets.backend, false, path);
  }
  assert.equal(deploymentTargets([], 'test').testing, true);
  assert.equal(deploymentTargets([], 'test', true, true).deployBackend, false);
  assert.equal(deploymentTargets([], 'dev', true, true).backend, false);
  assert.equal(deploymentTargets([], 'main', false, true).deployBackend, false);
  assert.equal(deploymentTargets([], 'main', true, true).deployBackend, true);
});

test('Linux visual workspaces exclude environment files and local assets', () => {
  assert.deepEqual(
    visualWorkspaceFiles([
      'package.json',
      'apps/frontend/auth/src/App.tsx',
      'apps/frontend/frontend-env.d.ts',
      'apps/frontend/sanny/src/pages/games/Games.tsx',
      'apps/backend/.env',
      '../outside/package.json',
      'apps/frontend/auth/.env.local',
      '.secret/key',
      'apps/backend/redis/certs/ca.crt',
      'node_modules/vite/index.js',
      'apps/frontend/sanny/dist/index.html',
      'apps/documentation/build/index.html',
    ]),
    [
      'package.json',
      'apps/frontend/auth/src/App.tsx',
      'apps/frontend/frontend-env.d.ts',
      'apps/frontend/sanny/src/pages/games/Games.tsx',
    ]
  );
  assert.match(
    read('tooling/scripts/run-test-linux-visual.mjs'),
    /lock\.packages\[['"]node_modules\/@playwright\/test['"]\]/
  );
});

test('Linux visual dependency images invalidate for every build input', () => {
  const inputs = [
    ['package.json', '{"packageManager":"npm@11.6.3"}'],
    ['package-lock.json', '{"lockfileVersion":3}'],
    ['apps/frontend/auth/package.json', '{"name":"auth"}'],
    ['apps/backend/docker/Dockerfile.visual', 'FROM playwright'],
  ];
  const image = visualDependencyImage(inputs);
  assert.match(image, /^sanny64-visual-deps:[a-f0-9]{64}$/);
  assert.equal(image, visualDependencyImage([...inputs].reverse()));
  for (const [index] of inputs.entries()) {
    const changed = inputs.map(([path, content], position) => [
      path,
      position === index ? `${content}\n` : content,
    ]);
    assert.notEqual(image, visualDependencyImage(changed));
  }
  assert.notEqual(image, visualDependencyImage(inputs.slice(1)));
  assert.notEqual(
    image,
    visualDependencyImage([
      ...inputs,
      ['apps/frontend/sanny/package.json', '{}'],
    ])
  );
});

test('visual suites have Linux counterparts for Windows baselines', () => {
  for (const suite of ['auth-accessibility', 'sanny-accessibility']) {
    const directory = resolve(
      root,
      `shared/tests/e2e/mock/${suite}.spec.ts-snapshots`
    );
    const files = readdirSync(directory);
    const windows = files.filter((name) => name.endsWith('-win32.png'));
    assert.ok(windows.length > 0);
    for (const name of windows) {
      assert.ok(
        files.includes(name.replace(/-win32\.png$/, '-linux.png')),
        name
      );
    }
  }
});

test('runtime enforcement rejects unsupported Node and npm versions', () => {
  const npmVersion = json('package.json').packageManager.slice(4);
  assert.doesNotThrow(() =>
    assertRuntime(read('tooling/config/.nvmrc').trim(), npmVersion)
  );
  assert.throws(() => assertRuntime('26.9.0', npmVersion), /Node.js 24/);
  assert.throws(() => assertRuntime('24.22.0', '11.0.0'), /Use npm/);
  assert.equal(
    json('package.json').scripts.preinstall,
    'node tooling/scripts/check-runtime.mjs'
  );
});

test('Redis test TLS is generated independently of local certificates', async () => {
  const directory = await createRedisTestCertificates();
  try {
    const authority = new X509Certificate(
      await readFile(resolve(directory, 'ca.crt'))
    );
    const certificate = new X509Certificate(
      await readFile(resolve(directory, 'redis.crt'))
    );
    assert.equal(authority.ca, true);
    assert.ok(certificate.verify(authority.publicKey));
    assert.equal(certificate.checkHost('redis'), 'redis');
    assert.equal(certificate.checkHost('production.example.test'), undefined);
    assert.ok(Date.parse(certificate.validTo) - Date.now() < 86_400_000);
    const compose = read(
      'apps/backend/docker/compose/docker-compose.test.redis.yml'
    );
    assert.doesNotMatch(compose, /\.\.\/redis\/certs/);
    assert.match(compose, /SANNY_REDIS_TEST_CERTS/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('frontend API configuration selects deployment inputs and validates origins', () => {
  const environment = {
    VITE_DEV_API_URL: 'https://dev.example.test/',
    VITE_PROD_API_URL: 'https://api.example.test',
  };
  for (const mode of ['development', 'test']) {
    assert.equal(
      resolveFrontendApiUrl(environment, mode, 'build'),
      'https://dev.example.test'
    );
  }
  assert.equal(
    resolveFrontendApiUrl(environment, 'production', 'build'),
    'https://api.example.test'
  );
  assert.equal(
    resolveFrontendApiUrl(
      { ...environment, VITE_API_URL: 'https://override.example.test' },
      'production',
      'build'
    ),
    'https://override.example.test'
  );
  assert.equal(
    resolveFrontendApiUrl(
      { VITE_API_URL: 'http://localhost:8443' },
      'development',
      'serve'
    ),
    'http://localhost:8443'
  );
  for (const value of [
    undefined,
    'not-a-url',
    'http://api.example.test',
    'https://user:password@api.example.test',
    'https://api.example.test/path',
    'https://api.example.test/?key=value',
    'https://api.example.test/#fragment',
  ]) {
    assert.throws(() =>
      resolveFrontendApiUrl({ VITE_API_URL: value }, 'production', 'build')
    );
  }
});

test('workspaces expose distinct lint, typecheck, and composed check scripts', () => {
  for (const directory of [
    'apps/backend',
    'apps/frontend/auth',
    'apps/frontend/sanny',
    'apps/documentation',
    ...sharedPackages.map((name) => `shared/packages/${name}`),
  ]) {
    const { scripts } = json(`${directory}/package.json`);
    assert.match(scripts.lint, /^eslint /, directory);
    assert.match(scripts.typecheck, /^tsc /, directory);
    assert.equal(scripts.check, 'npm run lint && npm run typecheck', directory);
    assert.equal(scripts['type-check'], undefined, directory);
    assert.notEqual(scripts.test, 'npm run lint', directory);
  }
  const { scripts } = json('package.json');
  for (const [suffix, workspace] of [
    ['backend', 'apps/backend'],
    ['auth', 'apps/frontend/auth'],
    ['sanny', 'apps/frontend/sanny'],
    ['docs', 'apps/documentation'],
  ]) {
    for (const operation of ['lint', 'typecheck', 'check']) {
      assert.equal(
        scripts[`${operation}:${suffix}`],
        `npm run ${operation} -w ${workspace === 'apps/backend' ? 'backend' : workspace === 'apps/frontend/auth' ? 'auth' : workspace === 'apps/frontend/sanny' ? 'sanny' : 'documentation'}`
      );
    }
  }
});

test('shared packages export existing source without redundant build steps', () => {
  for (const name of sharedPackages) {
    const directory = `shared/packages/${name}`;
    const manifest = json(`${directory}/package.json`);
    const entry = manifest.exports['.'];
    const source = typeof entry === 'string' ? entry : entry.default;
    assert.match(source, /\.tsx?$/);
    assert.ok(existsSync(resolve(root, directory, source)));
    assert.ok(manifest.scripts.typecheck);
    assert.equal(manifest.scripts['build:frontend'], undefined);
    assert.equal(manifest.main, undefined);
    assert.equal(manifest.types, undefined);
  }
});

test('frontend environment declarations reject unknown keys', () => {
  const path = resolve(root, 'apps/frontend/auth/tsconfig.json');
  const { config } = ts.readConfigFile(path, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    resolve(root, 'apps/frontend/auth')
  );
  const filePath = resolve(
    root,
    'apps/frontend/auth/src/config-contract-probe.ts'
  );
  const options = { ...parsed.options, incremental: false };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, createNew) =>
    resolve(name) === filePath
      ? ts.createSourceFile(
          name,
          'export const valid = import.meta.env.VITE_API_URL; export const invalid = import.meta.env.VITE_APPI_URL;',
          languageVersion,
          true
        )
      : getSourceFile(name, languageVersion, onError, createNew);
  const program = ts.createProgram(
    [...parsed.fileNames, filePath],
    options,
    host
  );
  const diagnostics = program.getSemanticDiagnostics(
    program.getSourceFile(filePath)
  );
  assert.equal(diagnostics.length, 1);
  assert.match(
    ts.flattenDiagnosticMessageText(diagnostics[0].messageText, ' '),
    /VITE_APPI_URL/
  );
});

test('Auth0 scripts have narrow runtime lint scopes', async () => {
  assert.match(json('apps/backend/package.json').scripts.lint, /\bauth0\b/);
  const eslint = new ESLint({ cwd: root });
  const results = await eslint.lintText(
    'function login(email, password, callback) { callback(new ValidationError(configuration.message)); }',
    { filePath: 'apps/backend/auth0/database-action/login.js' }
  );
  assert.equal(results[0].errorCount, 0);
  const browser = await eslint.calculateConfigForFile(
    'apps/frontend/auth/src/main.tsx'
  );
  assert.equal(browser.languageOptions.globals.configuration, undefined);
});

test('repository-wide development tools have one root owner', () => {
  const dependencies = json('package.json').devDependencies;
  const tools = [
    'typescript',
    'vite',
    '@types/node',
    '@types/react',
    '@types/react-dom',
    'yaml',
  ];
  for (const tool of tools) assert.ok(dependencies[tool], tool);
  for (const directory of [
    'apps/backend',
    'apps/frontend/auth',
    'apps/frontend/sanny',
    'apps/documentation',
    ...sharedPackages.map((name) => `shared/packages/${name}`),
  ]) {
    const manifest = json(`${directory}/package.json`);
    for (const tool of tools)
      assert.equal(
        manifest.devDependencies?.[tool],
        undefined,
        `${directory}: ${tool}`
      );
  }
});

test('workspace installs have one lockfile', () => {
  for (const directory of [
    'apps/frontend/auth',
    'apps/frontend/sanny',
    'apps/documentation',
    'apps/backend',
  ]) {
    assert.equal(
      existsSync(resolve(root, directory, 'package-lock.json')),
      false
    );
    assert.ok(json('package-lock.json').packages[directory]);
  }
});

test('deployments use authenticated FTPS and the canonical API build input', () => {
  for (const name of ['auth', 'sanny', 'docs', 'to-test']) {
    const path = `.github/workflows/deploy-${name}.yml`;
    const workflow = parse(read(path));
    const steps = Object.values(workflow.jobs).flatMap(
      (job) => job.steps ?? []
    );
    const uploads = steps.filter((step) =>
      step.uses?.startsWith('SamKirkland/FTP-Deploy-Action@')
    );
    assert.ok(uploads.length, path);
    for (const upload of uploads) {
      assert.equal(upload.with.protocol, 'ftps', path);
      assert.equal(upload.with.security, 'strict', path);
    }
    assert.doesNotMatch(read(path), /--insecure/, path);
    if (name === 'docs') continue;
    const build = steps.find((step) => step.env?.VITE_API_URL);
    assert.ok(build, path);
    assert.equal(
      build.env.VITE_API_URL,
      name === 'to-test'
        ? '${{ vars.VITE_DEV_API_URL }}'
        : '${{ vars.VITE_PROD_API_URL }}'
    );
  }
});

test('test deployment staging populates the directories selected for upload', () => {
  const workflow = parse(read('.github/workflows/deploy-to-test.yml'));
  const step = workflow.jobs['lint-and-build'].steps.find(
    (entry) => entry.name === 'Stage testing sites'
  );
  const fixture = mkdtempSync(resolve(tmpdir(), 'sanny-staging-contract-'));
  try {
    for (const directory of [
      'apps/frontend/sanny/dist',
      'apps/frontend/auth/dist',
      'apps/documentation/build',
    ]) {
      mkdirSync(resolve(fixture, directory), { recursive: true });
      writeFileSync(resolve(fixture, directory, 'index.html'), directory);
    }
    const bash =
      process.platform === 'win32'
        ? resolve(
            process.env.ProgramFiles ?? 'C:/Program Files',
            'Git/bin/bash.exe'
          )
        : 'bash';
    const result = spawnSync(bash, ['-e', '-c', step.run], {
      cwd: fixture,
      encoding: 'utf8',
      env: {
        ...process.env,
        TEST_BASIC_AUTH_ENTRY: 'fixture:non-secret-test-hash',
        TEST_BASIC_AUTH_FILE_PATH: '/fixture/private/.htpasswd',
      },
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    for (const { site } of workflow.jobs.deploy.strategy.matrix.include) {
      const directory = resolve(fixture, 'testing-site', site);
      assert.ok(existsSync(resolve(directory, 'index.html')), site);
      assert.match(
        readFileSync(resolve(directory, '.htaccess'), 'utf8'),
        /Require valid-user/
      );
    }
    assert.equal(
      readFileSync(resolve(fixture, 'testing-site/sanny/.htpasswd'), 'utf8'),
      'fixture:non-secret-test-hash\n'
    );
    assert.match(
      readFileSync(resolve(fixture, 'testing-site/auth/.htaccess'), 'utf8'),
      /RewriteRule \^ index\.html/
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('production Compose resolves environment and TLS paths from the backend project', () => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'sanny-compose-contract-'));
  const project = resolve(fixture, 'apps/backend');
  const directory = resolve(project, 'docker/compose');
  try {
    mkdirSync(directory, { recursive: true });
    for (const name of ['dev', 'prod']) {
      writeFileSync(
        resolve(directory, `docker-compose.${name}.yml`),
        read(`apps/backend/docker/compose/docker-compose.${name}.yml`)
      );
    }
    const inputs = resolve(fixture, 'compose-inputs');
    writeFileSync(
      inputs,
      [
        'BACKEND_IMAGE_TAG=0123456789012345678901234567890123456789',
        'REDIS_PASSWORD=fixture-only',
        'DISCORD_WEBHOOK=https://example.invalid/fixture',
        'GRAFANA_ADMIN_USER=fixture',
        'GRAFANA_ADMIN_PASSWORD=fixture-only',
        'GRAFANA_DEV_ROOT_URL=https://example.invalid/grafana/',
        'GRAFANA_PROD_ROOT_URL=https://example.invalid/grafana/',
        'SMTP_HOST=example.invalid:587',
        'SMTP_USER=fixture',
        'SMTP_PASSWORD=fixture-only',
        'SMTP_FROM_ADDRESS=fixture@example.invalid',
        '',
      ].join('\n')
    );
    const result = spawnSync(
      'docker',
      [
        'compose',
        '--project-directory',
        project,
        '--env-file',
        inputs,
        '-f',
        resolve(directory, 'docker-compose.prod.yml'),
        'config',
        '--format',
        'json',
        '--no-env-resolution',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          BACKEND_IMAGE_TAG: '0123456789012345678901234567890123456789',
        },
      }
    );
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    const backend = JSON.parse(result.stdout).services['sanny64-backend'];
    assert.equal(
      backend.image,
      'sanny64/backend:0123456789012345678901234567890123456789'
    );
    assert.equal(resolve(backend.env_file[0].path), resolve(project, '.env'));
    const authority = backend.volumes.find(
      (volume) => volume.target === '/app/redis-ca.crt'
    );
    assert.equal(
      resolve(authority.source),
      resolve(project, 'redis/secret/certs/ca.crt')
    );
    assert.equal(backend.build, undefined);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('backend deployment selects the published commit and its matching checkout', () => {
  const workflow = parse(read('.github/workflows/deploy-backend.yml'));
  const metadata = workflow.jobs['build-and-publish'].steps.find(
    (step) => step.id === 'meta'
  );
  const deploy = workflow.jobs.deploy;
  const release = parse(read('.github/workflows/release.yml'));
  assert.equal(
    release.on.workflow_dispatch.inputs['backend-directory'].type,
    'string'
  );
  assert.equal(
    release.jobs.backend.with['deployment-directory'],
    '${{ inputs.backend-directory }}'
  );
  assert.equal(
    workflow.on.workflow_call.inputs['deployment-directory'].type,
    'string'
  );
  assert.equal(
    deploy.env.BACKEND_DEPLOY_DIRECTORY,
    '${{ inputs.deployment-directory }}'
  );
  assert.ok(
    metadata.with.tags
      .split('\n')
      .includes(`type=raw,value=${deploy.env.BACKEND_IMAGE_TAG}`)
  );
  assert.match(metadata.with.images, /ghcr\.io\/sanny64\/sanny\/backend/);
  const remote = deploy.steps.find(
    (step) => step.name === 'Deploy backend to VPS'
  ).with;
  assert.match(remote.script, /set -eu/);
  assert.match(remote.script, /git rev-parse HEAD/);
  assert.match(remote.script, /cd apps\/backend/);
  assert.match(
    remote.script,
    /--project-directory \. --env-file \.env -f docker\/compose\/docker-compose\.prod\.yml/
  );
  assert.match(remote.script, /--wait --wait-timeout/);
});

test('backend deployment executes only for the approved clean revision', () => {
  const workflow = parse(read('.github/workflows/deploy-backend.yml'));
  const script = workflow.jobs.deploy.steps.find(
    (step) => step.name === 'Deploy backend to VPS'
  ).with.script;
  const fixture = mkdtempSync(resolve(tmpdir(), 'sanny-deployment-contract-'));
  const bin = resolve(fixture, 'bin');
  const log = resolve(fixture, 'docker-commands');
  try {
    mkdirSync(bin);
    mkdirSync(resolve(fixture, 'apps/backend'), { recursive: true });
    writeFileSync(
      resolve(bin, 'git'),
      [
        '#!/usr/bin/env bash',
        'if [ "$1" = "rev-parse" ]; then',
        '  printf "%s\\n" "$FIXTURE_REVISION"',
        'else',
        '  exit "${FIXTURE_DIRTY:-0}"',
        'fi',
        '',
      ].join('\n'),
      { mode: 0o755 }
    );
    writeFileSync(
      resolve(bin, 'docker'),
      [
        '#!/usr/bin/env bash',
        'printf "%s\\n" "$*" >> "$FIXTURE_COMMAND_LOG"',
        'if [ "$1" = "login" ]; then cat > /dev/null; fi',
        'if [[ "$*" == *"config --quiet"* ]]; then exit "${FIXTURE_CONFIG_FAILURE:-0}"; fi',
        '',
      ].join('\n'),
      { mode: 0o755 }
    );
    const revision = '0123456789012345678901234567890123456789';
    const bash =
      process.platform === 'win32'
        ? resolve(
            process.env.ProgramFiles ?? 'C:/Program Files',
            'Git/bin/bash.exe'
          )
        : 'bash';
    const run = (overrides = {}) =>
      spawnSync(bash, ['-c', `export PATH="$PWD/bin:$PATH"\n${script}`], {
        cwd: fixture,
        encoding: 'utf8',
        env: {
          ...process.env,
          BACKEND_DEPLOY_DIRECTORY: fixture.replaceAll('\\', '/'),
          BACKEND_IMAGE_TAG: revision,
          DOCKERHUB_USERNAME: 'fixture',
          DOCKERHUB_PAT: 'fixture-only',
          FIXTURE_REVISION: revision,
          FIXTURE_COMMAND_LOG: log.replaceAll('\\', '/'),
          FIXTURE_DIRTY: '0',
          FIXTURE_CONFIG_FAILURE: '0',
          ...overrides,
        },
      });
    for (const overrides of [
      { FIXTURE_REVISION: 'different-revision' },
      { FIXTURE_DIRTY: '1' },
      { BACKEND_DEPLOY_DIRECTORY: '' },
    ]) {
      const result = run(overrides);
      assert.equal(result.error, undefined, result.error?.message);
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(log), false);
    }
    const invalidConfig = run({ FIXTURE_CONFIG_FAILURE: '1' });
    assert.notEqual(invalidConfig.status, 0);
    assert.doesNotMatch(
      readFileSync(log, 'utf8'),
      /pull sanny64-backend|up -d/
    );
    rmSync(log);
    const success = run();
    assert.equal(success.status, 0, success.stderr);
    const commands = readFileSync(log, 'utf8');
    assert.match(
      commands,
      /config --quiet\n[\s\S]*pull sanny64-backend\n[\s\S]*up -d --no-build --wait --wait-timeout 120 sanny64-backend/
    );
    assert.doesNotMatch(commands, /image prune|down|--volumes/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('formatting uses the root EditorConfig and Prettier ignore file', () => {
  const { scripts } = json('package.json');
  assert.equal(scripts.format, 'prettier . --write');
  assert.equal(scripts['format:check'], 'prettier . --check');
  assert.ok(existsSync(resolve(root, 'prettier.config.ts')));
  assert.ok(existsSync(resolve(root, '.editorconfig')));
  assert.match(read('.editorconfig'), /end_of_line = lf/);
  assert.ok(existsSync(resolve(root, '.prettierignore')));
});

test('Auth0 scripts use the experimental ternary layout only', async () => {
  const auth0Path = resolve(root, 'apps/backend/auth0/example.js');
  const otherPath = resolve(root, 'apps/backend/src/example.js');
  const auth0Options = await prettier.resolveConfig(auth0Path);
  const otherOptions = await prettier.resolveConfig(otherPath);
  const formatted = await prettier.format(
    'const result = condition ? firstChoice : secondChoice;\n',
    { ...auth0Options, filepath: auth0Path, printWidth: 25 }
  );

  assert.match(formatted, /condition\n\s+\? firstChoice/);
  assert.equal(otherOptions?.experimentalTernaries, undefined);
});

test('every deployment waits for the common secret-free verification gate', () => {
  const verification = parse(read('.github/workflows/verify.yml'));
  assert.ok(Object.hasOwn(verification.on, 'pull_request'));
  assert.ok(Object.hasOwn(verification.on, 'workflow_call'));
  assert.equal(verification.permissions.contents, 'read');
  assert.ok(
    verification.jobs.verify.steps.some(
      (step) => step.run === 'npm run test:ci'
    )
  );
  assert.doesNotMatch(read('.github/workflows/verify.yml'), /secrets\./);
  const release = parse(read('.github/workflows/release.yml'));
  assert.equal(release.jobs.verify.uses, './.github/workflows/verify.yml');
  assert.equal(
    Object.values(release.jobs).filter(
      (job) => job.uses === './.github/workflows/verify.yml'
    ).length,
    1
  );
  for (const name of ['auth', 'sanny', 'docs', 'to-test', 'backend']) {
    const workflow = parse(read(`.github/workflows/deploy-${name}.yml`));
    assert.deepEqual(Object.keys(workflow.on), ['workflow_call']);
    assert.equal(workflow.jobs.verify, undefined);
    const caller = Object.values(release.jobs).find(
      (job) => job.uses === `./.github/workflows/deploy-${name}.yml`
    );
    assert.deepEqual(caller.needs, ['plan', 'verify'], name);
    assert.notEqual(caller.secrets, 'inherit');
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/, step.uses);
      }
    }
  }
  for (const workflow of [release, verification]) {
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
      }
    }
  }
});

test('TypeScript target is centralized across runtime workspaces', () => {
  assert.equal(json('tsconfig.json').compilerOptions.target, 'ES2023');
  for (const path of [
    'apps/frontend/tsconfig.frontend.json',
    'apps/backend/tsconfig.json',
  ]) {
    assert.equal(json(path).compilerOptions.target, undefined, path);
  }
});

test('compiler ownership separates browser sources from Node tooling', () => {
  const base = json('tsconfig.json').compilerOptions;
  assert.equal(base.module, 'NodeNext');
  assert.equal(base.moduleResolution, 'NodeNext');
  for (const path of [
    'apps/frontend/auth/tsconfig.json',
    'apps/frontend/sanny/tsconfig.json',
  ]) {
    const config = json(path);
    assert.equal(config.extends, '../tsconfig.frontend.json');
    assert.deepEqual(config.include, ['src']);
    assert.equal(config.references, undefined);
  }
  for (const name of sharedPackages) {
    assert.equal(
      json(`shared/packages/${name}/tsconfig.json`).extends,
      '../../../apps/frontend/tsconfig.frontend.json'
    );
  }
  const path = resolve(root, 'tsconfig.json');
  const config = ts.readConfigFile(path, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.deepEqual(parsed.errors, []);
  assert.equal(
    parsed.options.moduleResolution,
    ts.ModuleResolutionKind.NodeNext
  );
  for (const file of [
    'apps/frontend/vite.config.ts',
    'apps/frontend/vitest.config.ts',
    'apps/frontend/auth/vite.config.ts',
    'apps/frontend/sanny/vite.config.ts',
    'shared/packages/ui/vitest.config.ts',
  ]) {
    assert.ok(
      parsed.fileNames.some((name) => resolve(name) === resolve(root, file)),
      file
    );
  }
});

test('frontend Vitest roots are anchored to their workspace configs', () => {
  for (const [config, path] of [
    [frontendVitestConfig, 'apps/frontend'],
    [authVitestConfig, 'apps/frontend/auth'],
    [sannyVitestConfig, 'apps/frontend/sanny'],
    [uiVitestConfig, 'shared/packages/ui'],
  ]) {
    assert.equal(resolve(config.test.root), resolve(root, path), path);
  }
});

test('shared editor lint discovery uses the same policy as npm', async () => {
  for (const name of sharedPackages) {
    const directory = resolve(root, 'shared/packages', name);
    const manifest = json(`shared/packages/${name}/package.json`);
    assert.equal(manifest.scripts.lint, 'eslint .');
    const eslint = new ESLint({ cwd: directory });
    const config = await eslint.calculateConfigForFile(
      name === 'ui' ? 'src/index.ts' : 'index.ts'
    );
    assert.ok(config.rules['@typescript-eslint/no-explicit-any']);
    assert.equal(
      config.rules['react-refresh/only-export-components'],
      undefined
    );
  }
});

test('ESLint keeps Node globals out of browser source', async () => {
  const eslint = new ESLint({ cwd: root });
  const browserConfig = await eslint.calculateConfigForFile(
    'apps/frontend/auth/src/main.tsx'
  );
  const toolingConfig = await eslint.calculateConfigForFile(
    'playwright.config.ts'
  );

  assert.equal(browserConfig.languageOptions.globals.process, undefined);
  assert.ok(Object.hasOwn(toolingConfig.languageOptions.globals, 'process'));
  const vitestConfig = await eslint.calculateConfigForFile(
    'shared/packages/ui/vitest.config.ts'
  );
  assert.equal(vitestConfig.languageOptions.globals.window, undefined);
  assert.equal(vitestConfig.rules['react-hooks/rules-of-hooks'], undefined);
  const backendConfig = await eslint.calculateConfigForFile(
    'apps/backend/src/server.ts'
  );
  for (const config of [browserConfig, backendConfig]) {
    assert.equal(config.languageOptions.parserOptions.projectService, true);
    assert.equal(config.languageOptions.parserOptions.tsconfigRootDir, root);
    assert.equal(config.rules['@typescript-eslint/await-thenable'][0], 2);
    assert.equal(config.rules['@typescript-eslint/no-floating-promises'][0], 2);
  }
});

test('backend 5xx logs retain only the route and safe error class', () => {
  const server = read('apps/backend/src/server.ts');
  assert.match(
    server,
    /errorType:\s*error instanceof Error \? error\.name : typeof error/
  );
  assert.match(server, /route:\s*request\.routeOptions\.url/);
  assert.doesNotMatch(server, /request\.log\.error\(\{[^}]*error\.message/);
});

test('Auth0 token requests use the documented OAuth endpoint', () => {
  for (const file of [
    'apps/backend/src/routes/auth.route.ts',
    'apps/backend/src/utils/auth0-management.ts',
    'apps/backend/src/utils/session.ts',
    'apps/backend/auth0/post-login/linkAccounts.js',
    'apps/backend/auth0/post-login/roleClaims.js',
    'apps/backend/auth0/post-login/verifyEmail.js',
    'apps/backend/auth0/post-user-registration/assignDefaultUserRole.js',
  ]) {
    assert.match(read(file), /\/oauth\/token/);
    assert.doesNotMatch(read(file), /\/oapps\/frontend\/auth\/token/);
  }
});

test('default browser tests exclude live authentication and monitoring', () => {
  assert.notEqual(baseBrowserConfig, browserConfig);
  assert.equal(
    resolve(browserConfig.testDir),
    resolve(root, 'shared/tests/e2e/mock')
  );
  assert.equal(browserConfig.workers, 2);
  assert.equal(
    json('package.json').scripts['test:e2e:mocked'],
    'playwright test --config=shared/tests/e2e/playwright.mocked.config.ts'
  );
  assert.deepEqual(
    browserConfig.projects.map((project) => project.name),
    ['chromium', 'firefox', 'webkit', 'edge']
  );
  for (const server of browserConfig.webServer) {
    assert.equal(server.reuseExistingServer, !process.env.CI);
    assert.equal(resolve(server.cwd), resolve(root));
  }
  assert.equal(browserConfig.forbidOnly, Boolean(process.env.CI));
});

test('live authentication uses one API origin for the app and backend checks', () => {
  const liveConfig = read('shared/tests/e2e/playwright.real.config.ts');
  const liveTest = read('shared/tests/e2e/real/login-logout.spec.ts');
  const apiOrigin =
    /SANNY_E2E_API_URL\s*\?\?\s*(?:process\.)?env\.VITE_API_URL\s*\?\?\s*["']https:\/\/localhost:8443["']/;

  assert.match(liveConfig, apiOrigin);
  assert.match(liveTest, apiOrigin);
  assert.match(liveConfig, /reuseExistingServer:\s*false/);
  assert.match(liveConfig, /sanny -- --host 127\.0\.0\.1 --port 5178/);
  assert.doesNotMatch(liveConfig, /auth -- --host/);
  assert.match(liveTest, /127\.0\.0\.1:5178/);
  assert.match(liveTest, /SANNY_E2E_TRUSTED_ORIGIN/);
  assert.match(liveConfig, /\['TESTUSER_EMAIL', 'TESTUSER_PASSWORD'\]/);
  assert.match(liveConfig, /Live Auth0 tests require/);
  assert.doesNotMatch(liveConfig, /TESTGOOGLEUSER_EMAIL/);
  assert.match(
    read('shared/tests/e2e/playwright.monitoring.config.ts'),
    /SANNY_E2E_API_URL\s*\?\?\s*process\.env\.VITE_API_URL\s*\?\?/
  );
});

test('opted-in 429 tests load only Grafana credentials from the local backend environment', () => {
  const monitoringConfig = read(
    'shared/tests/e2e/playwright.monitoring.config.ts'
  );
  assert.match(monitoringConfig, /RUN_429_SPIKE_E2E === 'true'/);
  assert.match(
    monitoringConfig,
    /'NGINX_BASIC_AUTH_USER'[\s\S]*?'NGINX_BASIC_AUTH_PASSWORD'[\s\S]*?'GRAFANA_ADMIN_USER'[\s\S]*?'GRAFANA_ADMIN_PASSWORD'/
  );
  assert.match(monitoringConfig, /apps\/backend\/.env/);
  assert.match(
    monitoringConfig,
    /only these four credentials are read by this test config/
  );
  assert.match(
    read('shared/tests/e2e/monitoring/429-spike.spec.ts'),
    /nginx\/secret\/\.htpasswd/
  );
  assert.match(
    read('shared/tests/e2e/monitoring/429-spike.spec.ts'),
    /request\.post\('\/grafana\/login'/
  );
});

test('backend test cleanup only targets services newly started by the gate', () => {
  assert.deepEqual(
    newlyStartedServices(['redis', 'grafana'], ['redis', 'grafana', 'nginx']),
    ['nginx']
  );
  assert.deepEqual(newlyStartedServices(['redis'], ['redis']), []);
  const runner = read('tooling/scripts/run-test-with-stopwatch.mjs');
  assert.match(runner, /ps', '--services', '--status', 'running'/);
  assert.match(runner, /\['stop', \.\.\.startedServices\]/);
  assert.doesNotMatch(runner, /['"]stop:backend['"]/);
  assert.match(runner, /if \(await isBackendHealthy\(url\)\)[\s\S]*?return 0;/);
  assert.match(
    runner,
    /if \(!LOOPBACK_HOSTS\.has\(url\.hostname\)\)[\s\S]*?return 1;/
  );
  assert.match(runner, /BACKEND_START_TIMEOUT_MS = 180_000/);
  assert.match(runner, /while \(now\(\) < deadline && !isCancelled\(\)\)/);
  assert.match(runner, /if \(isCancelled\(\)\) return 1;/);
  assert.match(
    runner,
    /finally \{[\s\S]*?if \(previouslyRunningBackendServices\)[\s\S]*?runDockerCompose\(\s*\['stop', \.\.\.startedServices\]/
  );
});

test('backend readiness handles success, timeout, and cancellation', async () => {
  let healthChecks = 0;
  assert.equal(
    await waitForBackendReady({
      isHealthy: async () => ++healthChecks === 2,
      isCancelled: () => false,
      now: () => 0,
      pause: async () => {},
    }),
    true
  );

  let time = 0;
  assert.equal(
    await waitForBackendReady({
      isHealthy: async () => false,
      isCancelled: () => false,
      timeoutMs: 10,
      now: () => {
        const current = time;
        time += 5;
        return current;
      },
      pause: async () => {},
    }),
    false
  );

  let cancelled = false;
  assert.equal(
    await waitForBackendReady({
      isHealthy: async () => false,
      isCancelled: () => cancelled,
      now: () => 0,
      pause: async () => {
        cancelled = true;
      },
    }),
    false
  );
});

test('docs browser tests use a dedicated mobile Chromium server', () => {
  assert.equal(
    resolve(docsBrowserConfig.testDir),
    resolve(root, 'shared/tests/e2e/docs')
  );
  assert.deepEqual(
    docsBrowserConfig.projects.map((project) => project.name),
    ['chromium-mobile']
  );
  assert.deepEqual(docsBrowserConfig.projects[0].use.viewport, {
    width: 390,
    height: 844,
  });
  assert.equal(docsBrowserConfig.projects[0].use.isMobile, true);
  assert.equal(docsBrowserConfig.projects[0].use.hasTouch, true);
  assert.equal(docsBrowserConfig.webServer.length, 1);
  assert.match(docsBrowserConfig.webServer[0].command, /documentation/);
  assert.equal(
    json('package.json').scripts['test:e2e:docs'],
    'playwright test --config=shared/tests/e2e/playwright.docs.config.ts'
  );
});

test('tooling relocation removes obsolete paths and preserves Docker configuration', () => {
  for (const path of [
    'shared/frontend-env.d.ts',
    'playwright.real.config.ts',
    'playwright.monitoring.config.ts',
    'e2e',
  ]) {
    assert.equal(existsSync(resolve(root, path)), false, path);
  }
  assert.ok(
    existsSync(resolve(root, 'shared/tests/contracts/config.test.mjs'))
  );
  assert.equal(
    json('package.json').scripts['test:tooling'],
    'node --test shared/tests/contracts/config.test.mjs'
  );
  assert.match(
    read('apps/backend/docker/Dockerfile'),
    /COPY tsconfig\.json \.\/tsconfig\.json/
  );
  assert.match(read('apps/backend/docker/Dockerfile'), /\/app\/tsconfig\.json/);
  assert.match(read('eslint.config.js'), /globalIgnores/);
});

test('mocked browser and visual commands cover accessibility checks', () => {
  const { scripts } = json('package.json');
  assert.equal(
    scripts['test:e2e:mocked'],
    'playwright test --config=shared/tests/e2e/playwright.mocked.config.ts'
  );
  for (const file of [
    'auth-accessibility.spec.ts',
    'sanny-accessibility.spec.ts',
    'accessibility.spec.ts',
  ]) {
    assert.ok(existsSync(resolve(root, 'shared/tests/e2e/mock', file)), file);
  }
  assert.equal(
    scripts['test:visual:linux'],
    'node tooling/scripts/run-test-linux-visual.mjs'
  );
  const visualRunner = read('tooling/scripts/run-test-linux-visual.mjs');
  assert.match(visualRunner, /auth-accessibility\.spec\.ts/);
  assert.match(visualRunner, /sanny-accessibility\.spec\.ts/);
  assert.match(visualRunner, /--project chromium --grep 'visual baseline'/);
  const webkit = browserConfig.projects.find(
    (project) => project.name === 'webkit'
  );
  assert.ok(webkit.testMatch.includes('**/*accessibility.spec.ts'));
});

test('the full gate runs each suite once and covers all major browsers', () => {
  const { scripts } = json('package.json');
  const backendScripts = json('apps/backend/package.json').scripts;
  assert.match(scripts['test:ci'], /npm run check(?: &&|$)/);
  assert.match(scripts['test:ci'], /npm run build:frontend/);
  assert.doesNotMatch(
    scripts['test:ci'],
    /npm run build:backend|npm run build(?:\s|&&)/
  );
  assert.equal(
    scripts.build,
    'npm run build:backend && npm run build:frontend'
  );
  assert.match(
    scripts['build:frontend'],
    /npm run build:auth && npm run build:docs && npm run build:sanny/
  );
  assert.equal(
    scripts['build:docs:en'],
    'npm run build -w documentation -- --locale en'
  );
  assert.equal(
    scripts['build:docs:de'],
    'npm run build -w documentation -- --locale de'
  );
  assert.equal(scripts['build:docs'], 'npm run build -w documentation');
  assert.equal(scripts['build:docs:all'], undefined);
  assert.match(scripts['test:ci'], /npm run test:components/);
  assert.match(scripts['test:ci'], /npm run test:frontend:contracts/);
  assert.match(scripts['test:ci'], /npm run test:auth/);
  assert.match(scripts['test:ci'], /npm run test:sanny/);
  assert.match(scripts['test:ci'], /npm run test:e2e:mocked/);
  assert.match(
    scripts['test:ci'],
    /npm run test:e2e:mocked && npm run test:e2e:docs/
  );
  assert.match(scripts['test:ci'], /npm run test:visual:linux/);
  assert.doesNotMatch(
    scripts['test:ci'],
    /npm run test:frontend(?: &&|$)|test:integration(?: &&|$)/
  );
  assert.equal(
    scripts.test,
    'node tooling/scripts/run-test-with-stopwatch.mjs'
  );
  const testRunner = read('tooling/scripts/run-test-with-stopwatch.mjs');
  assert.match(
    testRunner,
    /const previouslyRunningServices = await runningBackendServices[\s\S]*?onBackendStart\(previouslyRunningServices\)/
  );
  assert.match(
    testRunner,
    /if \(isCancelled\(\)\) return 1;\s+console\.log\(`Backend at/
  );
  assert.match(testRunner, /if \(previouslyRunningBackendServices\)/);
  assert.deepEqual(FULL_GATE_SCRIPTS, [
    'test:ci',
    'test:e2e:real',
    'test:e2e:429',
  ]);
  assert.deepEqual(LIVE_GATE_SCRIPTS, ['test:e2e:real']);
  assert.deepEqual(E2E_GATE_SCRIPTS, [
    'test:e2e:mocked',
    'test:e2e:real',
    'test:e2e:429',
    'test:e2e:docs',
  ]);
  assert.deepEqual(MONITORING_GATE_SCRIPTS, ['test:e2e:429']);
  assert.deepEqual(
    [...BACKEND_DEPENDENT_SCRIPTS],
    ['test:e2e:real', 'test:e2e:429']
  );
  assert.deepEqual(PLAYWRIGHT_GATE_ARGS, {
    'test:e2e:real': [
      'test',
      '--config=shared/tests/e2e/playwright.real.config.ts',
      '--headed',
    ],
    'test:e2e:429': [
      'test',
      '--config=shared/tests/e2e/playwright.monitoring.config.ts',
      '--project=chromium',
    ],
  });
  assert.equal(scripts['test:e2e:real:playwright'], undefined);
  assert.equal(scripts['test:e2e:429:playwright'], undefined);
  assert.ok(
    read('tooling/scripts/run-test-with-stopwatch.mjs').includes(
      'spawn(process.execPath, commandArgs'
    )
  );
  assert.equal(backendHealthUrl({}).href, 'https://localhost:8443/healthcheck');
  assert.equal(
    backendHealthUrl({ SANNY_E2E_API_URL: 'https://127.0.0.1:9443/api' }).href,
    'https://127.0.0.1:9443/healthcheck'
  );
  assert.deepEqual(
    selectStaleTestProjects(
      [
        'sanny-monitoring-tests-10',
        'sanny-monitoring-tests-10',
        'sanny-monitoring-tests-20',
        'sanny-monitoring-tests-x',
        'sanny64',
      ],
      'sanny-monitoring-tests-',
      (processId) => processId === 20
    ),
    ['sanny-monitoring-tests-10']
  );
  for (const runner of [
    'tooling/scripts/run-redis-tests.mjs',
    'tooling/scripts/run-integration.mjs',
  ]) {
    assert.match(read(runner), /removeStaleTestProjects\(projectPrefix/);
  }
  assert.equal(scripts['test:backend:redis'], undefined);
  assert.equal(
    backendScripts.test,
    'npm run test:unit && npm run test:integration:monitoring && npm run test:integration:redis && npm run test:integration:discord'
  );
  assert.equal(
    [...scripts['test:ci'].matchAll(/npm run test:backend(?:\s|$)/g)].length,
    1
  );
  assert.doesNotMatch(scripts.test, /test:integration:redis/);
  assert.doesNotMatch(
    read('tooling/scripts/run-redis-tests.mjs'),
    /--env-file.*\.env/
  );
  assert.doesNotMatch(
    read('apps/backend/docker/compose/docker-compose.test.redis.yml'),
    /extends:|env_file:/
  );
  assert.match(
    read('apps/backend/docker/compose/docker-compose.test.redis.yml'),
    /internal:\s*true/
  );
  assert.doesNotMatch(
    read('apps/backend/docker/compose/docker-compose.test.redis.yml'),
    /ports:/
  );
  assert.match(
    read('apps/backend/docker/compose/docker-compose.test.redis.yml'),
    /sanny-redis-test-only/
  );
  assert.match(read('tooling/scripts/run-redis-tests.mjs'), /["']--build["']/);
  assert.equal(
    parse(read('apps/backend/docker/compose/docker-compose.test.redis.yml'))
      .services['sanny64-backend'].build.dockerfile,
    'apps/backend/docker/Dockerfile'
  );
  assert.equal(
    scripts['test:e2e:real'],
    'node tooling/scripts/run-test-with-stopwatch.mjs --live-only'
  );
  assert.equal(
    scripts['test:e2e'],
    'node tooling/scripts/run-test-with-stopwatch.mjs --e2e-only'
  );
  assert.equal(
    scripts['test:e2e:mocked'],
    'playwright test --config=shared/tests/e2e/playwright.mocked.config.ts'
  );
  assert.equal(scripts['test:gate'], undefined);
  for (const scriptName of [
    'test:e2e:real:chromium',
    'test:e2e:real:firefox',
    'test:e2e:real:edge',
    'test:e2e:mocked:chromium',
    'test:e2e:mocked:firefox',
    'test:e2e:mocked:edge',
    'test:e2e:accessibility:auth',
    'test:e2e:accessibility:sanny',
    'test:e2e:accessibility:shared',
  ]) {
    assert.equal(scripts[scriptName], undefined, scriptName);
  }
  assert.deepEqual(
    browserConfig.projects.map((project) => project.name),
    ['chromium', 'firefox', 'webkit', 'edge']
  );
  for (const [app, workspace] of [
    ['auth', 'apps/frontend/auth'],
    ['sanny', 'apps/frontend/sanny'],
  ]) {
    assert.doesNotMatch(
      json(`${workspace}/package.json`).scripts.build,
      /typecheck|lint/
    );
    assert.match(
      scripts[`build:${app}`],
      new RegExp(`npm run build -w ${app}`)
    );
  }
});

test('production and test deployments build both documentation locales', () => {
  for (const workflowPath of [
    '.github/workflows/deploy-docs.yml',
    '.github/workflows/deploy-to-test.yml',
  ]) {
    const workflow = read(workflowPath);
    assert.match(workflow, /npm run build:docs(?:\r?\n|$)/);
    assert.doesNotMatch(workflow, /npm run build:docs:(?:en|de)/);
  }
  assert.equal(
    json('package.json').scripts['build:docs'],
    'npm run build -w documentation'
  );
  assert.match(
    read('apps/documentation/docusaurus.config.ts'),
    /locales:\s*\[\s*["']en["'],\s*["']de["']\s*\]/
  );
});

test('root script composition does not reference missing aliases', () => {
  const { scripts } = json('package.json');
  for (const [name, script] of Object.entries(scripts)) {
    for (const command of script.split('&&')) {
      const match = command.trim().match(/^npm run ([\w:-]+)(.*)$/);
      if (
        !match ||
        /(?:^|\s)(?:-w|--workspace|--workspaces)(?:\s|=|$)/.test(match[2])
      )
        continue;
      assert.ok(scripts[match[1]], `${name} references missing ${match[1]}`);
    }
  }
});

test('backend names are explicit without coupling isolated test projects', () => {
  const development = parse(
    read('apps/backend/docker/compose/docker-compose.dev.yml')
  );
  const production = parse(
    read('apps/backend/docker/compose/docker-compose.prod.yml')
  );
  const local = development.services['sanny64-backend'];
  assert.equal(local.image, 'sanny64/backend:latest');
  assert.equal(local.container_name, 'sanny64-backend');
  assert.equal(local.pull_policy, 'build');
  assert.deepEqual(local.env_file, ['.env']);
  assert.ok(
    development.services.nginx.volumes.includes(
      './nginx/secret/certs:/etc/nginx/certs:ro'
    )
  );
  assert.ok(
    development.services.redis.volumes.includes(
      './redis/secret/certs:/etc/redis/certs:ro'
    )
  );
  assert.ok(
    development.services.alloy.volumes.includes(
      './monitoring/config/config.alloy:/etc/alloy/config.alloy:ro'
    )
  );
  assert.equal(
    production.services['sanny64-backend'].container_name,
    'sanny64-backend'
  );
  for (const name of ['redis', 'monitoring']) {
    const isolated = parse(
      read(`apps/backend/docker/compose/docker-compose.test.${name}.yml`)
    );
    for (const service of Object.values(isolated.services)) {
      assert.equal(service.container_name, undefined);
      assert.notEqual(service.image, local.image);
    }
  }
});

test('Compose restart scripts distinguish full-stack and backend-only recreation', () => {
  const rootScripts = json('package.json').scripts;
  const backendScripts = json('apps/backend/package.json').scripts;
  const composeCommand =
    'docker compose --project-directory . --env-file .env -f docker/compose/docker-compose.dev.yml';

  assert.equal(
    rootScripts['initialize:stack'],
    'npm run initialize:stack -w backend'
  );
  assert.equal(rootScripts['start:stack'], 'npm run start -w backend');
  assert.equal(rootScripts['stop:stack'], 'npm run stop -w backend');
  assert.equal(
    backendScripts['initialize:stack'],
    `${composeCommand} up -d --build --force-recreate --remove-orphans`
  );
  assert.equal(backendScripts.start, `${composeCommand} start`);
  assert.equal(backendScripts.stop, `${composeCommand} stop`);
  assert.equal(
    backendScripts.restart,
    `${composeCommand} up -d --build --force-recreate sanny64-backend`
  );
});

test('production inherits common services without a local backend build', () => {
  const development = parse(
    read('apps/backend/docker/compose/docker-compose.dev.yml')
  );
  const production = parse(
    read('apps/backend/docker/compose/docker-compose.prod.yml')
  );
  assert.equal(development.services['sanny64-backend'].build.context, '../..');
  assert.equal(
    development.services['sanny64-backend'].build.dockerfile,
    'apps/backend/docker/Dockerfile'
  );
  assert.equal(production.services['sanny64-backend'].build, undefined);
  assert.match(
    production.services['sanny64-backend'].image,
    /^sanny64\/backend:/
  );
  assert.match(
    production.services['sanny64-backend'].image,
    /BACKEND_IMAGE_TAG/
  );
  assert.equal(
    production.services['sanny64-backend'].environment.PROD_TRUST_PROXY,
    '172.28.0.2'
  );
  for (const [name, service] of Object.entries(production.services)) {
    if (name === 'sanny64-backend') continue;
    assert.equal(service.extends.file, 'docker/compose/docker-compose.dev.yml');
    assert.ok(development.services[service.extends.service]);
  }
  assert.equal(development.services.promtail, undefined);
  assert.ok(development.services.alloy);
  assert.ok(development.volumes['alloy-data'] === null);
  assert.match(
    read('apps/backend/monitoring/config/config.alloy'),
    /legacy_positions_file/
  );
});

test('backend runtime loader is retained by production-only installs', () => {
  const manifest = json('apps/backend/package.json');
  const dockerfile = read('apps/backend/docker/Dockerfile');
  assert.ok(manifest.dependencies.tsx);
  assert.equal(manifest.devDependencies.tsx, undefined);
  assert.match(dockerfile, /npm ci --workspace=backend/);
  assert.doesNotMatch(dockerfile, /RUN npm install/);
  assert.match(
    dockerfile,
    /FROM builder AS production\s+RUN rm -rf \/app\/backend\/src\/tests \/app\/backend\/monitoring\/tests/
  );
  assert.match(dockerfile, /RUN mkdir -p \/app\/logs\s+WORKDIR \/app\/backend/);
  assert.match(
    dockerfile,
    /COPY --from=production .*\/app\/backend \/app\/backend/
  );
  for (const path of [
    'apps/backend/docker/compose/docker-compose.test.monitoring.yml',
    'apps/backend/docker/compose/docker-compose.test.redis.yml',
  ]) {
    assert.equal(
      parse(read(path)).services['monitoring-tests']?.build.target ??
        parse(read(path)).services['sanny64-backend']?.build.target,
      'builder',
      path
    );
  }
});

test('monitoring test rules preserve production queries and thresholds', () => {
  const documents = [
    '429-spikes',
    'auth-abuse',
    'callback-flood',
    'backend-operational',
  ].map((name) =>
    parse(read(`apps/backend/monitoring/alerting/rules/${name}.yml`))
  );
  const original = structuredClone(documents);
  const generated = createTestRules(documents);
  assert.deepEqual(documents, original);
  assert.equal(generated.groups.length, 3);
  for (const group of generated.groups) {
    assert.equal(group.interval, '10s');
    const production = documents
      .flatMap((document) => document.groups)
      .find((candidate) => candidate.name === group.name);
    assert.ok(production);
    for (const rule of group.rules) {
      const source = production.rules.find(
        (candidate) => candidate.uid === rule.uid
      );
      assert.deepEqual(rule, { ...source, for: '0s' });
    }
  }
  const compose = parse(
    read('apps/backend/docker/compose/docker-compose.test.monitoring.yml')
  );
  assert.ok(
    compose.services.grafana.volumes.some((volume) =>
      volume.includes('SANNY_MONITORING_TEST_RULES')
    )
  );
});
