import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
export const read = (path) => readFileSync(resolve(root, path), 'utf8');
export const json = (path) => JSON.parse(read(path));
export const sharedPackages = ['i18n', 'styles', 'ui'];
