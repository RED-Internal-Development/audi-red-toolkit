# MSI Sync TypeScript Action Design

## Goal

Replace the current Python-based MSI sync action with a new reusable TypeScript action in `audi-red-toolkit` that keeps the existing caller contract intact, preserves the generated Confluence page-title format exactly, and improves performance, robustness, and fault tolerance.

The new action will be added as a standalone reusable action. Existing callers will not be updated in this slice.

## Scope

In scope:
- Add `actions/msi-sync` as a `node24` GitHub Action following ADR `0001-typescript-reusable-actions.md`.
- Preserve the current public inputs:
  - `from`
  - `parentPageId`
  - `deploymentConfig`
  - `baseUrl`
  - `spaceKey`
  - `token`
  - `diagrams_source`
- Preserve current page-title output exactly, including the `Title (app-name)` convention.
- Preserve current `deploymentConfig` behavior as-is.
- Move MSI-specific preprocessing, validation, attachment staging, Mermaid generation, and Confluence publishing into the new action.
- Reuse shared packages where appropriate.

Out of scope:
- Updating existing caller workflows to use the new action.
- Changing page-title format.
- Redesigning `deploymentConfig`.
- Removing `diagrams_source` from the public contract in this slice.
- General workflow refactoring outside the new action.

## Key Decisions

### One End-To-End Action

The new implementation will use one public action, `actions/msi-sync`, rather than splitting preprocessing and publish into separate actions.

Why:
- Keeps the caller contract simple.
- Centralizes MSI-specific behavior in one testable codebase.
- Avoids passing intermediate staged state between actions.
- Allows validation, staging, and publish to share one in-memory plan.

### Backward-Compatible `diagrams_source`

`diagrams_source` stays in the public contract, but becomes optional internally.

Behavior:
- If `diagrams_source` is provided, the action accepts it for backward compatibility.
- If `diagrams_source` is not provided, the action stages attachments in its own temp workspace.
- Documentation will describe `diagrams_source` as compatibility-oriented input rather than a required long-term design center.

### Validation-First Publishing

The action will not sanitize invalid markdown/MDX at publish time.

Behavior:
- Validate content before any Confluence write.
- Fail fast if Confluence-incompatible content is detected.
- Emit machine-readable error lines and GitHub annotations.
- Publish only when validation passes.

This aligns with the upstream docs-sync validation direction and keeps content fixes at the source.

### Temp Workspace Instead Of Source Mutation

The action will not move images or rewrite source markdown in place.

Behavior:
- Copy only required staged artifacts into a temp workspace.
- Rewrite attachment and Mermaid references in staged page content only.
- Leave the checked-out repository untouched.

This removes a major source of fragility from the current workflow.

## Repository Layout

```text
actions/
  msi-sync/
    action.yml
    src/
      index.ts
      inputs.ts
      discovery.ts
      staging.ts
      mermaid.ts
      page-titles.ts
      page-registry.ts
      confluence-client.ts
      publish.ts
      summary.ts
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
  msi-sync/
```

The action will match the existing TypeScript reusable-action pattern already used by `actions/docs-sync`.

## Public Action Contract

The new `action.yml` will keep the existing input names intact.

Expected semantics:
- `from`: root directory to publish
- `parentPageId`: default Confluence parent page ID
- `deploymentConfig`: optional JSON file for extra folder-to-parent mappings
- `baseUrl`: Confluence Data Center base URL
- `spaceKey`: Confluence space key
- `token`: Confluence PAT
- `diagrams_source`: optional compatibility input for pre-staged diagrams

The action will normalize and validate inputs once at startup and return stable machine-readable error codes.

## Internal Execution Flow

### 1. Startup And Input Validation

The action will:
- read inputs via `@actions/core`
- mask secrets
- validate required values
- verify that `from` exists and is a directory
- load `deploymentConfig` if provided

Invalid startup conditions fail before any staging or network work.

### 2. Discovery

The action will scan the publish root once and build a structured manifest of:
- markdown/MDX files to publish
- directory hierarchy
- Mermaid blocks per file
- attachment references per file
- deployment roots implied by `deploymentConfig`

This replaces repeated filesystem walking and broad substring-based attachment detection.

### 3. Validation

The action will reuse `packages/docs-validation` to validate markdown/MDX content.

Rules:
- detect JSX-style raw HTML attributes such as `style={{...}}`
- detect unescaped ampersands in raw HTML tables

If validation issues exist:
- emit GitHub errors or annotations per file
- print machine-readable summary lines
- fail before any Confluence create, update, or attachment call

### 4. Staging

The action will stage publish artifacts in a temp directory.

Staging responsibilities:
- create stable temp directories for rendered Mermaid and copied attachments
- copy only referenced local images
- prepare staged markdown content with rewritten local attachment references
- support `diagrams_source` when supplied, without requiring it

The source checkout remains unchanged.

### 5. Mermaid Rendering

Mermaid generation will be action-owned.

Behavior:
- render only files that actually contain Mermaid blocks
- generate deterministic output names within the temp workspace
- replace Mermaid blocks with staged image references in staged content
- fail clearly if rendering fails

Implementation note:
- prefer invoking an already available Mermaid CLI when present
- otherwise keep the rendering boundary encapsulated so the caller workflow can decide how to provision Mermaid later

This slice focuses on action structure and responsibility boundaries; the implementation plan will decide whether Mermaid rendering is embedded, shell-invoked, or abstracted behind a renderer adapter.

### 6. Page Planning

Before publishing, the action will build an in-memory page plan containing:
- resolved page title
- resolved parent page ID
- source file path
- staged content
- attachment list
- deployment root or override context

This plan becomes the single source of truth for publish order and summary reporting.

### 7. Confluence Page Identity Resolution

The action will preserve title output but improve page identity handling.

Behavior:
- resolve existing pages by title plus parent context
- do not move a same-title page from another parent
- detect directory/file stem collisions such as `deployment/Deployment.md`
- let the markdown-backed file own the title space when directory and file would collide

This keeps titles stable while avoiding ambiguous updates.

### 8. Publish And Attachment Upload

Publishing will proceed only after validation and planning succeed.

Behavior:
- create or update pages according to the page plan
- upload only attachments referenced by that page
- update page content with Confluence attachment URLs only in staged content
- keep page and attachment operations separated enough for targeted retries later

### 9. Summary And Failure Handling

The action will accumulate:
- validation failures
- page create/update failures
- attachment upload failures
- warnings

Output behavior:
- write a concise GitHub step summary when available
- include page titles, status codes, and referral IDs when present
- fail the run when any page create/update fails

This ensures the workflow cannot remain green while pages are missing.

## Performance Strategy

The design improves performance mainly by reducing repeated work and removing Docker overhead.

Planned optimizations:
- JavaScript action on `node24`, no Docker startup
- one discovery pass over the publish root
- validate before network work
- render Mermaid only when Mermaid blocks exist
- upload only referenced attachments
- stage only needed files
- keep parent/title lookup explicit and bounded

Expected gains:
- lower startup overhead than Docker/Python action
- fewer filesystem passes
- fewer unnecessary attachment scans and uploads
- earlier failure on bad content

## Fault Tolerance And Robustness

The new action should fail clearly and deterministically.

Requirements:
- machine-readable error codes
- precise input validation
- no silent partial success
- summary output for publish failures
- no source mutation
- parent-aware page identity logic
- backward-compatible handling of legacy inputs

## Testing Strategy

Use `vitest` and mirror the existing reusable-action toolchain.

Test layers:
- unit tests for input parsing, title generation, validation integration, page identity helpers, and summary formatting
- fixture-based tests for markdown validation and Mermaid or attachment discovery
- integration-style tests for staged rewrite behavior and publish planning
- client-level tests for Confluence request construction and failure accounting

Key scenarios:
- invalid markdown blocks publish before network calls
- same-stem directory/file collision keeps title behavior stable
- parent-aware page matching updates the correct page
- partial publish failure returns a failing action status
- staged attachment rewriting does not mutate source files
- `deploymentConfig` preserves current alternate-parent behavior

## Rollout

This slice adds the new action only.

Rollout steps after implementation:
1. Build and commit `actions/msi-sync/dist/index.js`.
2. Verify tests and typecheck.
3. Document usage mapping from the current Python action to the new toolkit action.
4. Update caller workflows in a separate change after this action is stable.

## Risks And Mitigations

Risk: Mermaid rendering introduces runtime dependency complexity.
Mitigation: keep rendering behind a small adapter and document provisioning assumptions clearly.

Risk: Compatibility gaps with the legacy Python action.
Mitigation: preserve public inputs, preserve title output, preserve `deploymentConfig`, and add compatibility-focused tests.

Risk: Confluence behavior differences remain hard to fully simulate locally.
Mitigation: keep request construction isolated, test summaries and failure accounting thoroughly, and stage rollout through caller migration later.

## Success Criteria

The design is successful when:
- `actions/msi-sync` exists in `audi-red-toolkit`
- it preserves existing caller input names
- it preserves current page-title output exactly
- it validates before publishing
- it stages content without mutating the source checkout
- it publishes with parent-aware identity handling
- it fails on partial publish errors
- it is testable under the existing TypeScript reusable-action pattern
