import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import type { ConfluenceClient } from "../../actions/msi-sync/src/confluence-client.js";
import type { MsiSyncInputs } from "../../actions/msi-sync/src/inputs.js";
import { buildPublishPlan } from "../../actions/msi-sync/src/plan.js";
import { executeMsiSync } from "../../actions/msi-sync/src/sync.js";
import { PublishStats } from "../../actions/msi-sync/src/summary.js";

describe("msi-sync orchestration", () => {
  let workspaceRoot = "";
  let summaryPath = "";

  afterEach(async () => {
    delete process.env.GITHUB_STEP_SUMMARY;

    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true });
      workspaceRoot = "";
      summaryPath = "";
    }
  });

  test("publishes planned pages, uploads attachments, and rewrites final content to Confluence attachment URLs", async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "msi-sync-run-"));
    const sourceRoot = join(workspaceRoot, "docs", "backend_services_v2");
    summaryPath = join(workspaceRoot, "summary.md");
    process.env.GITHUB_STEP_SUMMARY = summaryPath;
    await writeFile(summaryPath, "", "utf8");

    const guideFile = join(sourceRoot, "my-service", "guide", "README.md");
    const imageFile = join(
      sourceRoot,
      "my-service",
      "guide",
      "images",
      "diagram.png",
    );

    await mkdir(join(sourceRoot, "my-service", "guide", "images"), {
      recursive: true,
    });
    await writeFile(
      guideFile,
      [
        "---",
        "title: Guide",
        "---",
        "# Guide",
        "![Diagram](./images/diagram.png)",
      ].join("\n"),
      "utf8",
    );
    await writeFile(imageFile, "binary", "utf8");

    const publishPlan = await buildPublishPlan({
      sourceRoot,
      parentPageId: "901",
    });
    const stats = new PublishStats();
    const calls: string[] = [];
    const updatedBodies: string[] = [];

    const client: ConfluenceClient = {
      async getPagesByTitle(title) {
        calls.push(`lookup:${title}`);
        return [];
      },
      async getPageById(pageId) {
        return { id: pageId, title: "stub" };
      },
      async getPageVersion() {
        return 1;
      },
      async createPage(input) {
        calls.push(`create:${input.title}`);
        return {
          ok: true,
          id:
            input.title === "README (my-service)"
              ? "p-readme"
              : input.title === "guide (my-service)"
                ? "p-guide"
                : "p-dir",
          title: input.title,
        };
      },
      async updatePage(input) {
        calls.push(`update:${input.title}`);
        updatedBodies.push(input.html);
        return { ok: true, id: input.id, title: input.title };
      },
      async listPageAttachments() {
        calls.push("list-attachments");
        return [];
      },
      async createAttachment(input) {
        calls.push(`create-attachment:${input.filename}`);
        return { ok: true, id: `att-${input.filename}`, title: input.filename };
      },
      async updateAttachment(input) {
        calls.push(`update-attachment:${input.filename}`);
        return { ok: true, id: input.attachmentId, title: input.filename };
      },
    };

    const inputs: MsiSyncInputs = {
      from: sourceRoot,
      parentPageId: "901",
      deploymentConfig: undefined,
      baseUrl: "https://example.invalid/confluence",
      spaceKey: "AAA",
      token: "token",
      diagramsSource: undefined,
    };

    const result = await executeMsiSync(inputs, publishPlan, stats, {
      createClient: () => client,
    });

    expect(result.publishedPages).toBe(3);
    expect(stats.hasFailures()).toBe(false);
    expect(calls.slice(0, 6)).toEqual([
      "lookup:my-service (my-service)",
      "create:my-service (my-service)",
      "lookup:guide (my-service)",
      "create:guide (my-service)",
      "lookup:README (my-service)",
      "create:README (my-service)",
    ]);
    expect(calls[6]).toMatch(/^create-attachment:[a-f0-9]{12}-diagram\.png$/);
    expect(calls[7]).toBe("update:README (my-service)");
    expect(updatedBodies).toHaveLength(1);
    expect(updatedBodies[0]).toContain(
      "https://example.invalid/confluence/download/attachments/p-readme/",
    );
    await expect(readFile(summaryPath, "utf8")).resolves.toContain(
      "status | success",
    );
  });
});
