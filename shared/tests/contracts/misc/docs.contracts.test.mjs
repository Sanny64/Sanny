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
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { recordDocumentationTranslationReview } from '../../../../apps/documentation/src/scripts/record-doc-translation-review.mjs';
import { warnDocumentationLineCounts } from '../../../../apps/documentation/src/scripts/warn-docs-translation.mjs';
import { root, read, json } from '../test.helper.mjs';

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
        return entry.isFile() && /\.mdx?$/.test(entry.name) ? [entry.name] : [];
      })
      .sort();

  const englishRoot = resolve(root, 'apps/documentation/docs');
  const germanRoot = resolve(
    root,
    'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current'
  );

  const pages = listPages(englishRoot);
  assert.ok(
    pages.length > 0,
    'The line-count check must discover documentation pages'
  );

  const mismatches = pages.flatMap((page) => {
    const englishContent = readFileSync(resolve(englishRoot, page), 'utf8');
    const germanContent = readFileSync(resolve(germanRoot, page), 'utf8');

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
        return entry.isFile() && /\.mdx?$/.test(entry.name) ? [entry.name] : [];
      })
      .sort();

  const englishRoot = resolve(root, 'apps/documentation/docs');
  const germanRoot = resolve(
    root,
    'apps/documentation/i18n/de/docusaurus-plugin-content-docs/current'
  );

  const checkContentRules = (content, relativePagePath) => {
    const violations = [];
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!frontmatterMatch) return violations;

    const frontmatterTitle = parse(frontmatterMatch[1])?.title;
    const contentAfterFrontmatter = content
      .slice(frontmatterMatch[0].length)
      .replace(/^\r?\n/, '');
    const lines = contentAfterFrontmatter.split(/\r?\n/);
    let firstHeadingLineIndex = -1;
    let headingText = '';

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index].trim();
      if (/^#{1,6}\s+/.test(line)) {
        firstHeadingLineIndex = index;
        headingText = line.replace(/^#+\s+/, '').trim();
        break;
      }
    }

    if (firstHeadingLineIndex !== -1) {
      if (
        !lines
          .slice(0, firstHeadingLineIndex)
          .some((line) => line.trim() === '')
      ) {
        violations.push(
          `${relativePagePath}: Kein Abstand (Leerzeile) zwischen dem schließenden '---' und der ersten Überschrift.`
        );
      }

      if (frontmatterTitle && headingText === frontmatterTitle) {
        violations.push(
          `${relativePagePath}: Der Titel '${frontmatterTitle}' aus dem Frontmatter darf nicht identisch als Überschrift wiederholt werden.`
        );
      }
    }
    return violations;
  };

  for (const title of ['Example', "'Example'", '"Example"']) {
    assert.match(
      checkContentRules(
        `---\ntitle: ${title}\n---\n\n# Example\n`,
        'fixture'
      )[0],
      /darf nicht identisch/
    );
  }
  assert.match(
    checkContentRules('---\ntitle: Example\n---\n## Other\n', 'fixture')[0],
    /Kein Abstand/
  );
  assert.deepEqual(
    checkContentRules(
      '---\r\ntitle: Example\r\n---\r\n\r\n## Other\r\n',
      'fixture'
    ),
    []
  );

  const violations = [];
  for (const [locale, directory] of [
    ['EN', englishRoot],
    ['DE', germanRoot],
  ]) {
    const pages = listPages(directory);
    assert.ok(
      pages.length > 0,
      `${locale}: The title check must discover documentation pages`
    );
    for (const page of pages) {
      violations.push(
        ...checkContentRules(
          readFileSync(resolve(directory, page), 'utf8'),
          `${locale}: ${page}`
        )
      );
    }
  }

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
        `import { warnDocumentationLineCounts } from ${JSON.stringify(new URL('../../../../apps/documentation/src/scripts/warn-docs-translation.mjs', import.meta.url).href)}; warnDocumentationLineCounts(${JSON.stringify(fixture)});`,
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
      json('package.json').scripts['test:core'].includes(
        'npm run test:contracts'
      )
    );
    assert.ok(
      json('package.json').scripts['test:core'].includes('npm run compare:docs')
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
