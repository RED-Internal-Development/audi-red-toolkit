import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { run } from "../../actions/msi-sync/src/index.js";
import { publishPage } from "../../actions/msi-sync/src/publish.js";
import {
  extractReferralId,
  PublishStats,
} from "../../actions/msi-sync/src/summary.js";

afterEach(() => {
  delete process.env.INPUT_FROM;
  delete process.env.INPUT_PARENTPAGEID;
  delete process.env.INPUT_DEPLOYMENTCONFIG;
  delete process.env.INPUT_BASEURL;
  delete process.env.INPUT_SPACEKEY;
  delete process.env.INPUT_TOKEN;
  delete process.env.INPUT_DIAGRAMS_SOURCE;
});

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

  test("updates an existing page under the same parent", async () => {
    const stats = new PublishStats();
    const calls: string[] = [];

    const client = {
      async getPagesByTitle() {
        return [
          {
            id: "11",
            title: "Deployment (my-service)",
            ancestors: [{ id: "901" }],
          },
        ];
      },
      async createPage() {
        calls.push("create");
        return { ok: true as const, id: "new" };
      },
      async updatePage() {
        calls.push("update");
        return { ok: true as const, id: "11" };
      },
    };

    const pageId = await publishPage(client, stats, {
      title: "Deployment (my-service)",
      html: "<p>Hello</p>",
      parentId: "901",
    });

    expect(pageId).toBe("11");
    expect(calls).toEqual(["update"]);
  });

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
});
