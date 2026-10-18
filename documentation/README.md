# Docs Site

This docs site is built with [Docusaurus](https://docusaurus.io/) and runs as part of the root npm workspace.

## Installation

From the repository root:

```bash
npm ci
```

## Local Development

```bash
npm run dev:docs
```

This starts the local documentation server. Most changes are reflected live without a restart.

## Build

```bash
npm run build:docs
```

This generates static output in the docs build directory.

## Preview

```bash
npm run serve:docs
```

This builds the docs and serves the generated site locally for a final check.
