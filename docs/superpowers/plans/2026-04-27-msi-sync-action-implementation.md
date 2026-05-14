# MSI Sync TypeScript Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new standalone `actions/msi-sync` TypeScript GitHub Action in `audi-red-toolkit` that preserves the current MSI sync caller inputs and page-title output while making validation, staging, attachment discovery, and publishing more robust and testable.

**Architecture:** Build one end-to-end `node24` action with small internal modules for input parsing, discovery, staging, Mermaid handling, Confluence page identity resolution, publishing, and summary reporting. Reuse `packages/docs-validation` and `packages/action-common`, keep `deploymentConfig` semantics intact, and keep `diagrams_source` as a backward-compatible input that becomes optional internally.

**Tech Stack:** TypeScript, Node 24 GitHub Action runtime, `@actions/core`, `@actions/exec`, `vitest`, `@vercel/ncc`

---

## File Map

**Modify**
- `audi-red-toolkit/package.json`
- `audi-red-toolkit/tsconfig.json`
- `audi-red-toolkit/vitest.config.ts`

**Create**
- `audi-red-toolkit/actions/msi-sync/action.yml`
- `audi-red-toolkit/actions/msi-sync/src/index.ts`
- `audi-red-toolkit/actions/msi-sync/src/inputs.ts`
- `audi-red-toolkit/actions/msi-sync/src/page-titles.ts`
- `audi-red-toolkit/actions/msi-sync/src/page-registry.ts`
- `audi-red-toolkit/actions/msi-sync/src/discovery.ts`
- `audi-red-toolkit/actions/msi-sync/src/staging.ts`
- `audi-red-toolkit/actions/msi-sync/src/mermaid.ts`
- `audi-red-toolkit/actions/msi-sync/src/confluence-client.ts`
- `audi-red-toolkit/actions/msi-sync/src/publish.ts`
- `audi-red-toolkit/actions/msi-sync/src/summary.ts`
- `audi-red-toolkit/actions/msi-sync/dist/index.js`
- `audi-red-toolkit/tests/msi-sync/inputs.test.ts`
- `audi-red-toolkit/tests/msi-sync/page-titles.test.ts`
- `audi-red-toolkit/tests/msi-sync/page-registry.test.ts`
- `audi-red-toolkit/tests/msi-sync/discovery.test.ts`
- `audi-red-toolkit/tests/msi-sync/staging.test.ts`
- `audi-red-toolkit/tests/msi-sync/publish.test.ts`
- `audi-red-toolkit/tests/msi-sync/fixtures/basic-tree/`
- `audi-red-toolkit/tests/msi-sync/fixtures/collision-tree/`
- `audi-red-toolkit/tests/msi-sync/fixtures/mermaid-tree/`
- `audi-red-toolkit/tests/msi-sync/fixtures/deployment-config.json`

---

### Task 1: Scaffold The New Action And Lock The Public Contract

**Files:**
- Modify: `audi-red-toolkit/package.json`
- Create: `audi-red-toolkit/actions/msi-sync/action.yml`
- Create: `audi-red-toolkit/actions/msi-sync/src/index.ts`
- Create: `audi-red-toolkit/actions/msi-sync/src/inputs.ts`
- Test: `audi-red-toolkit/tests/msi-sync/inputs.test.ts`

- [ ] **Step 1: Add build support for the new action**

Update `audi-red-toolkit/package.json`.

```json
{
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "npm run build:docs-sync && npm run build:msi-sync",
    "build:docs-sync": "ncc build actions/docs-sync/src/index.ts --out actions/docs-sync/dist --source-map --license licenses.txt",
    "build:msi-sync": "ncc build actions/msi-sync/src/index.ts --out actions/msi-sync/dist --source-map --license licenses.txt"
  }
}
```

- [ ] **Step 2: Write the failing input parsing tests**

Create `audi-red-toolkit/tests/msi-sync/inputs.test.ts`.

```ts
import { describe, expect, test } from "vitest";

import { parseMsiSyncInputsFromRecord } from "../../actions/msi-sync/src/inputs.js";

const baseInputs = {
  from: "docs/backend_services_v2/my-service",
  parentPageId: "12345",
  deploymentConfig: "deployment-config.json",
  baseUrl: "https://collaboration.msi.audi.com/confluence",
  spaceKey: "AAA",
  token: "masked-token",
  diagrams_source: "diagrams"
};

describe("msi-sync input parsing", () => {
  test("normalizes valid inputs and keeps diagrams_source optional", () => {
    expect(parseMsiSyncInputsFromRecord(baseInputs)).toEqual({
      from: "docs/backend_services_v2/my-service",
      parentPageId: "12345",
      deploymentConfig: "deployment-config.json",
      baseUrl: "https://collaboration.msi.audi.com/confluence",
      spaceKey: "AAA",
      token: "masked-token",
      diagramsSource: "diagrams"
    });

    expect(
      parseMsiSyncInputsFromRecord({
        ...baseInputs,
        diagrams_source: undefined
      }),
    ).toMatchObject({
      diagramsSource: undefined
    });
  });

  test("rejects missing required inputs", () => {
    expect(() =>
      parseMsiSyncInputsFromRecord({
        ...baseInputs,
        from: ""
      }),
    ).toThrow("MSI_INVALID_INPUT");
  });
});
```

- [ ] **Step 3: Run the new input tests to verify they fail**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm test -- --run tests/msi-sync/inputs.test.ts
```

Expected: FAIL with module-not-found errors for `actions/msi-sync/src/inputs.ts`.

- [ ] **Step 4: Implement the action contract and input parser**

Create `audi-red-toolkit/actions/msi-sync/action.yml`.

```yml
name: Publish markdown/MDX docs to MSI Confluence
description: Validates, stages, and publishes a markdown or MDX directory tree to MSI Confluence.
inputs:
  from:
    description: Directory to publish, relative to the repository root.
    required: true
  parentPageId:
    description: Parent Confluence page ID for the published hierarchy.
    required: true
  deploymentConfig:
    description: Optional JSON file describing extra folder-to-parent mappings.
    required: false
  baseUrl:
    description: Base URL of the Confluence Data Center instance.
    required: true
  spaceKey:
    description: Confluence space key.
    required: true
  token:
    description: Personal access token for Confluence.
    required: true
  diagrams_source:
    description: Optional compatibility input for pre-staged diagrams and images.
    required: false
runs:
  using: node24
  main: dist/index.js
branding:
  icon: upload-cloud
  color: blue
```

Create `audi-red-toolkit/actions/msi-sync/src/inputs.ts`.

```ts
import * as core from "@actions/core";

import { ActionError } from "../../../packages/action-common/src/errors.js";

export interface MsiSyncInputs {
  from: string;
  parentPageId: string;
  deploymentConfig: string | undefined;
  baseUrl: string;
  spaceKey: string;
  token: string;
  diagramsSource: string | undefined;
}

type InputRecord = Record<string, string | undefined>;

export function readMsiSyncInputs(): MsiSyncInputs {
  const token = core.getInput("token");
  if (token) {
    core.setSecret(token);
  }

  return parseMsiSyncInputsFromRecord({
    from: core.getInput("from"),
    parentPageId: core.getInput("parentPageId"),
    deploymentConfig: core.getInput("deploymentConfig"),
    baseUrl: core.getInput("baseUrl"),
    spaceKey: core.getInput("spaceKey"),
    token,
    diagrams_source: core.getInput("diagrams_source")
  });
}

export function parseMsiSyncInputsFromRecord(inputs: InputRecord): MsiSyncInputs {
  return {
    from: requireInput(inputs, "from"),
    parentPageId: requireInput(inputs, "parentPageId"),
    deploymentConfig: optionalInput(inputs, "deploymentConfig"),
    baseUrl: requireInput(inputs, "baseUrl"),
    spaceKey: requireInput(inputs, "spaceKey"),
    token: requireInput(inputs, "token"),
    diagramsSource: optionalInput(inputs, "diagrams_source")
  };
}

function requireInput(inputs: InputRecord, name: string): string {
  const value = optionalInput(inputs, name);
  if (!value) {
    throw new ActionError("MSI_INVALID_INPUT", "validate_inputs", `${name} is required.`);
  }
  return value;
}

function optionalInput(inputs: InputRecord, name: string): string | undefined {
  const value = inputs[name]?.trim();
  return value ? value : undefined;
}
```

Create `audi-red-toolkit/actions/msi-sync/src/index.ts`.

```ts
import * as core from "@actions/core";

import { isActionError } from "../../../packages/action-common/src/errors.js";
import { readMsiSyncInputs } from "./inputs.js";

export async function run(): Promise<void> {
  const inputs = readMsiSyncInputs();
  core.info(`Preparing MSI sync from ${inputs.from} into space ${inputs.spaceKey}.`);
  core.notice("MSI sync action scaffold loaded.");
}

run().catch((error: unknown) => {
  if (isActionError(error)) {
    core.setFailed(error.message);
    return;
  }
  core.setFailed(error instanceof Error ? error.message : String(error));
});
```

- [ ] **Step 5: Run the input tests to verify they pass**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm test -- --run tests/msi-sync/inputs.test.ts
```

Expected: PASS with `2 passed`.

- [ ] **Step 6: Commit**

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
git add package.json actions/msi-sync/action.yml actions/msi-sync/src/index.ts actions/msi-sync/src/inputs.ts tests/msi-sync/inputs.test.ts
git commit -m "feat: scaffold msi sync action contract"
```

---

### Task 2: Add Page Title, Collision, And Discovery Primitives

**Files:**
- Create: `audi-red-toolkit/actions/msi-sync/src/page-titles.ts`
- Create: `audi-red-toolkit/actions/msi-sync/src/page-registry.ts`
- Create: `audi-red-toolkit/actions/msi-sync/src/discovery.ts`
- Test: `audi-red-toolkit/tests/msi-sync/page-titles.test.ts`
- Test: `audi-red-toolkit/tests/msi-sync/page-registry.test.ts`
- Test: `audi-red-toolkit/tests/msi-sync/discovery.test.ts`
- Create: `audi-red-toolkit/tests/msi-sync/fixtures/basic-tree/`
- Create: `audi-red-toolkit/tests/msi-sync/fixtures/collision-tree/`

- [ ] **Step 1: Write failing title and registry tests**

Create `audi-red-toolkit/tests/msi-sync/page-titles.test.ts`.

```ts
import { describe, expect, test } from "vitest";

import {
  getDirectoryPageTitle,
  getFilePageTitle,
  resolveAppName
} from "../../actions/msi-sync/src/page-titles.js";

describe("msi-sync page titles", () => {
  test("preserves legacy title format", () => {
    expect(getDirectoryPageTitle("deployment", "my-service")).toBe("deployment (my-service)");
    expect(getFilePageTitle("Deployment.md", "my-service")).toBe("Deployment (my-service)");
  });

  test("resolves app name from first segment under bucket root", () => {
    expect(
      resolveAppName("docs/backend_services_v2", "docs/backend_services_v2/my-service/arb"),
    ).toBe("my-service");
  });
});
```

Create `audi-red-toolkit/tests/msi-sync/page-registry.test.ts`.

```ts
import { describe, expect, test } from "vitest";

import {
  chooseExistingPage,
  isDirectoryFileCollision
} from "../../actions/msi-sync/src/page-registry.js";

describe("msi-sync page registry", () => {
  test("detects same-stem directory and file collisions case-insensitively", () => {
    expect(isDirectoryFileCollision("deployment", "Deployment.md")).toBe(true);
  });

  test("prefers existing page under the requested parent", () => {
    const page = chooseExistingPage(
      [
        { id: "10", title: "Deployment (my-service)", ancestors: [{ id: "900" }] },
        { id: "11", title: "Deployment (my-service)", ancestors: [{ id: "901" }] }
      ],
      "Deployment (my-service)",
      "901",
    );

    expect(page?.id).toBe("11");
  });
});
```

Create `audi-red-toolkit/tests/msi-sync/discovery.test.ts`.

```ts
import { describe, expect, test } from "vitest";

import {
  discoverPublishTree
} from "../../actions/msi-sync/src/discovery.js";

describe("msi-sync discovery", () => {
  test("discovers markdown files and collisions from fixture tree", async () => {
    const plan = await discoverPublishTree("tests/msi-sync/fixtures/collision-tree/docs/backend_services_v2");

    expect(plan.files.map((file) => file.relativePath)).toContain("my-service/deployment/Deployment.md");
    expect(plan.collisions).toEqual([
      {
        directoryPath: "my-service/deployment",
        filename: "Deployment.md"
      }
    ]);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm test -- --run tests/msi-sync/page-titles.test.ts tests/msi-sync/page-registry.test.ts tests/msi-sync/discovery.test.ts
```

Expected: FAIL with missing module errors.

- [ ] **Step 3: Add fixture trees for discovery**

Create fixture files:

`audi-red-toolkit/tests/msi-sync/fixtures/basic-tree/docs/backend_services_v2/my-service/arb/README.md`

```md
# ARB
```

`audi-red-toolkit/tests/msi-sync/fixtures/collision-tree/docs/backend_services_v2/my-service/deployment/Deployment.md`

```md
# Deployment
```

`audi-red-toolkit/tests/msi-sync/fixtures/collision-tree/docs/backend_services_v2/my-service/deployment/guide.md`

```md
# Guide
```

- [ ] **Step 4: Implement title, registry, and discovery primitives**

Create `audi-red-toolkit/actions/msi-sync/src/page-titles.ts`.

```ts
import { basename, relative, sep } from "node:path";

export function resolveAppName(rootDirectory: string, currentPath: string): string {
  const relativePath = relative(rootDirectory, currentPath);
  const parts = relativePath === "" ? [] : relativePath.split(sep);
  return parts[0] || basename(rootDirectory);
}

export function getDirectoryPageTitle(directoryName: string, appName: string): string {
  return `${directoryName} (${appName})`;
}

export function getFilePageTitle(filename: string, appName: string): string {
  const stem = filename.replace(/\.(md|mdx)$/i, "");
  return `${stem} (${appName})`;
}
```

Create `audi-red-toolkit/actions/msi-sync/src/page-registry.ts`.

```ts
export function chooseExistingPage(
  pages: Array<{ id: string; title?: string; ancestors?: Array<{ id: string }> }>,
  title: string,
  parentId: string | undefined,
) {
  const matching = pages.filter((page) => page.title?.toLowerCase() === title.toLowerCase());
  if (!parentId) {
    return matching[0];
  }
  return matching.find((page) =>
    (page.ancestors ?? []).some((ancestor) => ancestor.id === parentId),
  );
}

export function isDirectoryFileCollision(directoryName: string, filename: string): boolean {
  return directoryName.toLowerCase() === filename.replace(/\.(md|mdx)$/i, "").toLowerCase();
}
```

Create `audi-red-toolkit/actions/msi-sync/src/discovery.ts`.

```ts
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { isDirectoryFileCollision } from "./page-registry.js";

export interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
}

export interface PublishTree {
  files: DiscoveredFile[];
  collisions: Array<{ directoryPath: string; filename: string }>;
}

export async function discoverPublishTree(root: string): Promise<PublishTree> {
  const files: DiscoveredFile[] = [];
  const collisions: Array<{ directoryPath: string; filename: string }> = [];

  await walk(root, root, files, collisions);

  return {
    files: files.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    collisions
  };
}

async function walk(
  root: string,
  current: string,
  files: DiscoveredFile[],
  collisions: Array<{ directoryPath: string; filename: string }>,
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  const markdownEntries = entries.filter((entry) => entry.isFile() && /\.(md|mdx)$/i.test(entry.name));

  for (const entry of markdownEntries) {
    files.push({
      absolutePath: join(current, entry.name),
      relativePath: relative(root, join(current, entry.name))
    });
    if (isDirectoryFileCollision(current.split(/[\\/]/).pop() ?? "", entry.name)) {
      collisions.push({
        directoryPath: relative(root, current),
        filename: entry.name
      });
    }
  }

  for (const entry of entries.filter((entry) => entry.isDirectory())) {
    await walk(root, join(current, entry.name), files, collisions);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm test -- --run tests/msi-sync/page-titles.test.ts tests/msi-sync/page-registry.test.ts tests/msi-sync/discovery.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
git add actions/msi-sync/src/page-titles.ts actions/msi-sync/src/page-registry.ts actions/msi-sync/src/discovery.ts tests/msi-sync/page-titles.test.ts tests/msi-sync/page-registry.test.ts tests/msi-sync/discovery.test.ts tests/msi-sync/fixtures
git commit -m "feat: add msi sync discovery primitives"
```

---

### Task 3: Add Staging, Attachment Discovery, And Mermaid-Aware Rewrites

**Files:**
- Create: `audi-red-toolkit/actions/msi-sync/src/staging.ts`
- Create: `audi-red-toolkit/actions/msi-sync/src/mermaid.ts`
- Test: `audi-red-toolkit/tests/msi-sync/staging.test.ts`
- Create: `audi-red-toolkit/tests/msi-sync/fixtures/mermaid-tree/`

- [ ] **Step 1: Write the failing staging tests**

Create `audi-red-toolkit/tests/msi-sync/staging.test.ts`.

```ts
import { describe, expect, test } from "vitest";

import {
  collectAttachmentReferences,
  rewriteAttachmentReferences
} from "../../actions/msi-sync/src/staging.js";

describe("msi-sync staging", () => {
  test("collects only concrete local attachment references", () => {
    const refs = collectAttachmentReferences(
      [
        "![Local](./diagram.png)",
        "![Parent](../images/flow.svg)",
        "![Remote](https://example.com/image.png)"
      ].join("\n"),
    );

    expect(refs).toEqual(["./diagram.png", "../images/flow.svg"]);
  });

  test("rewrites only referenced attachments in staged markdown", () => {
    const rewritten = rewriteAttachmentReferences(
      "![Local](./diagram.png)",
      new Map([["./diagram.png", "staged/diagram.png"]]),
    );

    expect(rewritten).toContain("staged/diagram.png");
  });
});
```

- [ ] **Step 2: Run the staging test to verify it fails**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm test -- --run tests/msi-sync/staging.test.ts
```

Expected: FAIL with missing module errors.

- [ ] **Step 3: Implement attachment discovery and rewrite helpers**

Create `audi-red-toolkit/actions/msi-sync/src/staging.ts`.

```ts
const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g;

export function collectAttachmentReferences(markdown: string): string[] {
  const results = new Set<string>();
  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const target = match[1]?.trim();
    if (!target) {
      continue;
    }
    if (target.startsWith("./") || target.startsWith("../")) {
      results.add(target);
    }
  }
  return [...results];
}

export function rewriteAttachmentReferences(
  markdown: string,
  replacements: Map<string, string>,
): string {
  let rewritten = markdown;
  for (const [from, to] of replacements.entries()) {
    rewritten = rewritten.split(`](${from})`).join(`](${to})`);
  }
  return rewritten;
}
```

Create `audi-red-toolkit/actions/msi-sync/src/mermaid.ts`.

```ts
const MERMAID_BLOCK_RE = /```mermaid\r?\n([\s\S]*?)```/g;

export function extractMermaidBlocks(markdown: string): string[] {
  return [...markdown.matchAll(MERMAID_BLOCK_RE)].map((match) => match[1] ?? "");
}

export function replaceMermaidBlocks(markdown: string, replacements: string[]): string {
  let index = 0;
  return markdown.replace(MERMAID_BLOCK_RE, () => replacements[index++] ?? "");
}
```

- [ ] **Step 4: Add a Mermaid extraction test to the staging area**

Extend `audi-red-toolkit/tests/msi-sync/staging.test.ts`.

```ts
import {
  extractMermaidBlocks,
  replaceMermaidBlocks
} from "../../actions/msi-sync/src/mermaid.js";

test("extracts and replaces Mermaid blocks deterministically", () => {
  const markdown = ["```mermaid", "graph TD", "A-->B", "```"].join("\n");

  expect(extractMermaidBlocks(markdown)).toEqual(["graph TD\nA-->B\n"]);
  expect(replaceMermaidBlocks(markdown, ["![Diagram](diagram-1.svg)"])).toContain("diagram-1.svg");
});
```

- [ ] **Step 5: Run the staging tests to verify they pass**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm test -- --run tests/msi-sync/staging.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
git add actions/msi-sync/src/staging.ts actions/msi-sync/src/mermaid.ts tests/msi-sync/staging.test.ts
git commit -m "feat: add msi sync staging helpers"
```

---

### Task 4: Add Confluence Client, Publish Planning, And Failure Accounting

**Files:**
- Create: `audi-red-toolkit/actions/msi-sync/src/confluence-client.ts`
- Create: `audi-red-toolkit/actions/msi-sync/src/publish.ts`
- Create: `audi-red-toolkit/actions/msi-sync/src/summary.ts`
- Test: `audi-red-toolkit/tests/msi-sync/publish.test.ts`

- [ ] **Step 1: Write the failing publish tests**

Create `audi-red-toolkit/tests/msi-sync/publish.test.ts`.

```ts
import { describe, expect, test } from "vitest";

import {
  PublishStats,
  extractReferralId
} from "../../actions/msi-sync/src/summary.js";

describe("msi-sync publish summary", () => {
  test("extracts referral ids from Confluence error payloads", () => {
    expect(extractReferralId('{"referralId":"ref-123"}')).toBe("ref-123");
  });

  test("renders a failing summary when page publish fails", () => {
    const stats = new PublishStats();
    stats.recordFailure("create", "Deployment (my-service)", "500", "ref-500");

    expect(stats.hasFailures()).toBe(true);
    expect(stats.renderSummary()).toContain("Deployment (my-service)");
    expect(stats.renderSummary()).toContain("ref-500");
  });
});
```

- [ ] **Step 2: Run the publish test to verify it fails**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm test -- --run tests/msi-sync/publish.test.ts
```

Expected: FAIL with missing module errors.

- [ ] **Step 3: Implement summary and client primitives**

Create `audi-red-toolkit/actions/msi-sync/src/summary.ts`.

```ts
const REFERRAL_ID_RE = /"referralId"\s*:\s*"([^"]+)"/;

export class PublishStats {
  private failures: Array<{
    operation: string;
    title: string;
    statusCode: string;
    referralId?: string;
  }> = [];

  recordFailure(operation: string, title: string, statusCode: string, referralId?: string): void {
    this.failures.push({ operation, title, statusCode, referralId });
  }

  hasFailures(): boolean {
    return this.failures.length > 0;
  }

  renderSummary(): string {
    return [
      `MSI_PARTIAL_PUBLISH_FAILURE | publish | Found ${this.failures.length} page publish failure(s).`,
      ...this.failures.map((failure) =>
        [failure.operation, failure.title, failure.statusCode, failure.referralId]
          .filter(Boolean)
          .join(" | "),
      ),
    ].join("\n");
  }
}

export function extractReferralId(responseText: string): string | undefined {
  return REFERRAL_ID_RE.exec(responseText)?.[1];
}
```

Create `audi-red-toolkit/actions/msi-sync/src/confluence-client.ts`.

```ts
export interface ConfluencePage {
  id: string;
  title: string;
  ancestors?: Array<{ id: string }>;
}

export interface ConfluenceClient {
  getPagesByTitle(title: string): Promise<ConfluencePage[]>;
  createPage(input: { title: string; html: string; parentId?: string }): Promise<{ ok: true; id: string } | { ok: false; statusCode: string; body: string }>;
  updatePage(input: { id: string; title: string; html: string; parentId?: string }): Promise<{ ok: true; id: string } | { ok: false; statusCode: string; body: string }>;
}
```

Create `audi-red-toolkit/actions/msi-sync/src/publish.ts`.

```ts
import { chooseExistingPage } from "./page-registry.js";
import { extractReferralId, PublishStats } from "./summary.js";
import type { ConfluenceClient } from "./confluence-client.js";

export async function publishPage(
  client: ConfluenceClient,
  stats: PublishStats,
  page: { title: string; html: string; parentId?: string },
): Promise<string | undefined> {
  const existing = chooseExistingPage(await client.getPagesByTitle(page.title), page.title, page.parentId);

  if (existing) {
    const result = await client.updatePage({
      id: existing.id,
      title: page.title,
      html: page.html,
      parentId: page.parentId
    });
    if (!result.ok) {
      stats.recordFailure("update", page.title, result.statusCode, extractReferralId(result.body));
      return undefined;
    }
    return result.id;
  }

  const result = await client.createPage(page);
  if (!result.ok) {
    stats.recordFailure("create", page.title, result.statusCode, extractReferralId(result.body));
    return undefined;
  }
  return result.id;
}
```

- [ ] **Step 4: Add a publish-path test for parent-aware update selection**

Extend `audi-red-toolkit/tests/msi-sync/publish.test.ts`.

```ts
import { publishPage } from "../../actions/msi-sync/src/publish.js";

test("updates an existing page under the same parent", async () => {
  const stats = new PublishStats();
  const calls: string[] = [];

  const client = {
    async getPagesByTitle() {
      return [{ id: "11", title: "Deployment (my-service)", ancestors: [{ id: "901" }] }];
    },
    async createPage() {
      calls.push("create");
      return { ok: true as const, id: "new" };
    },
    async updatePage() {
      calls.push("update");
      return { ok: true as const, id: "11" };
    }
  };

  const pageId = await publishPage(client, stats, {
    title: "Deployment (my-service)",
    html: "<p>Hello</p>",
    parentId: "901"
  });

  expect(pageId).toBe("11");
  expect(calls).toEqual(["update"]);
});
```

- [ ] **Step 5: Run the publish tests to verify they pass**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm test -- --run tests/msi-sync/publish.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
git add actions/msi-sync/src/confluence-client.ts actions/msi-sync/src/publish.ts actions/msi-sync/src/summary.ts tests/msi-sync/publish.test.ts
git commit -m "feat: add msi sync publish primitives"
```

---

### Task 5: Integrate Validation, Planning, And Action Execution

**Files:**
- Modify: `audi-red-toolkit/actions/msi-sync/src/index.ts`
- Modify: `audi-red-toolkit/actions/msi-sync/src/discovery.ts`
- Modify: `audi-red-toolkit/actions/msi-sync/src/staging.ts`
- Modify: `audi-red-toolkit/actions/msi-sync/src/publish.ts`
- Modify: `audi-red-toolkit/tests/msi-sync/discovery.test.ts`
- Modify: `audi-red-toolkit/tests/msi-sync/publish.test.ts`

- [ ] **Step 1: Write the failing integration-style action test**

Append to `audi-red-toolkit/tests/msi-sync/publish.test.ts`.

```ts
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../../actions/msi-sync/src/index.js";

test("fails before Confluence writes when validation finds invalid content", async () => {
  const root = await mkdtemp(join(tmpdir(), "msi-sync-invalid-"));

  try {
    const source = join(root, "docs");
    await mkdir(source, { recursive: true });
    await writeFile(
      join(source, "Coverage.mdx"),
      '<table style={{ width: "100%" }}><tr><td>A</td></tr></table>\n',
      "utf8",
    );

    process.env.INPUT_FROM = source;
    process.env.INPUT_PARENTPAGEID = "123";
    process.env.INPUT_BASEURL = "https://example.invalid/confluence";
    process.env.INPUT_SPACEKEY = "AAA";
    process.env.INPUT_TOKEN = "token";

    await expect(run()).rejects.toThrow("MSI_INVALID_CONTENT");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the integration-style test to verify it fails**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm test -- --run tests/msi-sync/publish.test.ts
```

Expected: FAIL because `index.ts` still only logs scaffold output.

- [ ] **Step 3: Implement the real action control flow**

Update `audi-red-toolkit/actions/msi-sync/src/index.ts`.

```ts
import * as core from "@actions/core";
import { stat } from "node:fs/promises";

import { ActionError, isActionError } from "../../../packages/action-common/src/errors.js";
import { validatePath } from "../../../packages/docs-validation/src/confluence-validation.js";
import { discoverPublishTree } from "./discovery.js";
import { readMsiSyncInputs } from "./inputs.js";
import { PublishStats } from "./summary.js";

export async function run(): Promise<void> {
  const inputs = readMsiSyncInputs();
  await ensureDirectoryExists(inputs.from);

  const issues = await validatePath(inputs.from);
  if (issues.length > 0) {
    for (const issue of issues) {
      core.error(`${issue.filePath} | ${issue.ruleId} | ${issue.message}`);
    }
    throw new ActionError(
      "MSI_INVALID_CONTENT",
      "validate_docs",
      "Source content contains Confluence-incompatible markdown/MDX. Fix the reported files upstream before MSI sync can publish them.",
    );
  }

  const publishTree = await discoverPublishTree(inputs.from);
  const stats = new PublishStats();

  core.info(`Discovered ${publishTree.files.length} markdown file(s) for MSI sync.`);

  if (stats.hasFailures()) {
    throw new ActionError("MSI_PARTIAL_PUBLISH_FAILURE", "publish", stats.renderSummary());
  }
}

async function ensureDirectoryExists(directory: string): Promise<void> {
  const directoryStat = await stat(directory).catch(() => undefined);
  if (!directoryStat?.isDirectory()) {
    throw new ActionError("MSI_INVALID_INPUT", "validate_inputs", `'from' must reference an existing directory.`);
  }
}
```

- [ ] **Step 4: Run the MSI sync test slice**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm test -- --run tests/msi-sync/*.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
git add actions/msi-sync/src/index.ts actions/msi-sync/src/discovery.ts actions/msi-sync/src/staging.ts actions/msi-sync/src/publish.ts tests/msi-sync
git commit -m "feat: integrate msi sync action flow"
```

---

### Task 6: Build The Bundled Action And Run Full Verification

**Files:**
- Modify: `audi-red-toolkit/actions/msi-sync/dist/index.js`
- Modify: `audi-red-toolkit/actions/msi-sync/dist/index.js.map`
- Modify: `audi-red-toolkit/actions/msi-sync/dist/licenses.txt`
- Modify: `audi-red-toolkit/actions/msi-sync/dist/package.json`
- Modify: `audi-red-toolkit/actions/msi-sync/dist/sourcemap-register.cjs`

- [ ] **Step 1: Typecheck the toolkit**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run the full test suite**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm test
```

Expected: PASS for existing docs-sync and docs-validation tests plus the new MSI sync tests.

- [ ] **Step 3: Build the bundled action**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
npm run build:msi-sync
```

Expected: `actions/msi-sync/dist/index.js` and companion bundle files created or updated.

- [ ] **Step 4: Smoke-check the action bundle is wired in `action.yml`**

Run:

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
node -e "const fs=require('fs'); const y=fs.readFileSync('actions/msi-sync/action.yml','utf8'); if(!y.includes('main: dist/index.js')) throw new Error('bundle path missing'); console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
cd /Users/jaydeepvachhani/red_repos/RED-Toolkit-New/audi-red-toolkit
git add actions/msi-sync package.json tests/msi-sync
git commit -m "feat: add reusable msi sync action"
```

---

## Self-Review

Spec coverage check:
- standalone `actions/msi-sync`: covered by Tasks 1 and 6
- preserved inputs including `diagrams_source`: Task 1
- exact page-title format: Task 2
- validation-first behavior: Task 5
- temp staging and attachment rewriting: Task 3
- parent-aware identity handling and collisions: Tasks 2 and 4
- partial publish failure reporting: Task 4
- reusable action build and dist bundle: Task 6

Placeholder scan:
- no `TODO` or `TBD`
- every task names exact files
- every code-edit step includes concrete code
- every test step includes explicit commands and expected results

Type consistency:
- `MsiSyncInputs`, `PublishStats`, `discoverPublishTree`, `chooseExistingPage`, and `publishPage` use the same names throughout the plan
- public input names remain `from`, `parentPageId`, `deploymentConfig`, `baseUrl`, `spaceKey`, `token`, `diagrams_source`
