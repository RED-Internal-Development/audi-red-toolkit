# ADR 0001: Standardize Reusable GitHub Actions On TypeScript

## Status

Proposed

## Context

Audi RED Toolkit is consolidating reusable GitHub Actions that currently live in separate repositories. The current actions use a mix of Docker actions, composite actions, shell scripts, Python scripts, and per-action dependency management. That makes behavior harder to test consistently, slows rollout, and increases the cost of applying shared fixes such as input validation, logging, Git operations, and Confluence compatibility checks.

The first consolidation target is `audred_docsync_action`, which validates markdown/MDX for Confluence compatibility and pushes documentation into the RED documentation portal repository.

## Decision

New consolidated reusable actions in this repository will use TypeScript by default and will run as JavaScript actions with the GitHub Actions `node24` runtime.

Actions will be bundled with `@vercel/ncc` and tested with `vitest`.

Python can still be used for narrow domain tooling when there is a strong library or migration reason, but Python should not be the default action runtime because GitHub Actions does not provide a native `runs: python` action type. Python-based actions require either Docker or composite wrappers, which adds execution and maintenance overhead.

## Standard Repository Layout

```text
actions/
  docs-sync/
    action.yml
    src/
      index.ts
      inputs.ts
      git-sync.ts
    dist/
      index.js

packages/
  action-common/
    src/
      errors.ts
      logging.ts
  docs-validation/
    src/
      confluence-validation.ts

tests/
  docs-validation/
  docs-sync/
```

## Action Standards

- Use `runs.using: node24`.
- Keep each action's public contract in its own `action.yml`.
- Bundle each action entrypoint into `actions/<name>/dist/index.js` with `@vercel/ncc`.
- Commit bundled `dist/index.js` files so consumers do not install dependencies at runtime.
- Use `@actions/core` for inputs, outputs, secrets, annotations, and failure handling.
- Use stable machine-readable error codes, for example `DOCSYNC_INVALID_INPUT`.
- Normalize and validate action inputs once at startup.
- Keep shared behavior in `packages/*` instead of copying logic between actions.
- Use `vitest` for unit tests.
- Add integration-style tests around Git/file behavior when action behavior mutates repositories.
- Preserve existing input names during migration unless a breaking-version release explicitly changes them.

## TypeScript Versus Python

TypeScript is preferred for reusable action orchestration because GitHub hosts Node runtimes directly for JavaScript actions. This avoids Docker image build/pull time and avoids installing Python dependencies during workflow execution.

Python remains reasonable for complex content processing or existing validated code, but should be packaged behind a consistent TypeScript action interface if used.

For these actions, the major performance costs are repository cloning, dependency installation, network calls, and Git push operations. Raw TypeScript versus Python execution speed is not expected to materially affect total runtime. The practical performance improvement comes from avoiding Docker startup/build work and runtime dependency installation.

## Consequences

Positive:

- Faster action startup than Docker-based custom actions.
- One consistent test/build pipeline for reusable actions.
- Easier shared validation, logging, and Git behavior.
- Better GitHub-native annotations and secret masking.
- Lower maintenance cost as more actions are consolidated.

Tradeoffs:

- Existing Python and shell behavior must be ported or wrapped.
- Bundled `dist` files must be regenerated when source changes.
- Contributors need Node/TypeScript familiarity.

## Migration Plan

1. Add the TypeScript/Vitest/NCC toolchain to `audi-red-toolkit`.
2. Create `actions/docs-sync` as the first consolidated action.
3. Move Confluence markdown validation into `packages/docs-validation`.
4. Port docs-sync input handling, validation, clone, copy, commit, and push behavior.
5. Update the toolkit reusable workflow to call the local consolidated action.
6. Keep the old `audred_docsync_action` repository available during migration.
7. Publish a usage guide that maps old `uses: RED-Internal-Development/audred_docsync_action@...` calls to the new `uses: RED-Internal-Development/audi-red-toolkit/actions/docs-sync@...` path.
