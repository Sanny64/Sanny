/// <reference types="node" />

import { resolve } from 'node:path'

export function createStylesAlias(appDirectory: string) {
  return {
    '@sanny/styles': resolve(appDirectory, '../shared/packages/styles'),
  }
}