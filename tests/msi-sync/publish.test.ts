import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { run } from "../../actions/msi-sync/src/index.js";
import type { ConfluenceClient } from "../../actions/msi-sync/src/confluence-client.js";
import {
  publishDirectoryPage,
  publishFilePage,
  publishPage,
} from "../../actions/msi-sync/src/publish.js";
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

  test("renders attachment failures alongside page failures", () => {
    const stats = new PublishStats();
    stats.recordFailure("create", "Deployment (my-service)", "500", "ref-500");
    stats.recordFailure("upload", "diagram.png", "409", "ref-409", {
      targetType: "attachment",
      parentTitle: "Deployment (my-service)",
    });

    expect(stats.hasFailures()).toBe(true);
    expect(stats.renderSummary()).toContain("Found 2 publish failure(s)");
    expect(stats.renderSummary()).toContain("page:create=1");
    expect(stats.renderSummary()).toContain("attachment:upload=1");
    expect(stats.renderSummary()).toContain("diagram.png");
    expect(stats.renderSummary()).toContain("page=Deployment (my-service)");
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
      async getPageVersion() {
        return 1;
      },
      async updatePage() {
        calls.push("update");
        return { ok: true as const, id: "11" };
      },
      async listPageAttachments() {
        return [];
      },
      async createAttachment() {
        return { ok: true as const, id: "a1", title: "diagram.png" };
      },
      async updateAttachment() {
        return { ok: true as const, id: "a1", title: "diagram.png" };
      },
    } satisfies ConfluenceClient;

    const pageId = await publishPage(client, stats, {
      title: "Deployment (my-service)",
      html: "<p>Hello</p>",
      parentId: "901",
    });

    expect(pageId).toBe("11");
    expect(calls).toEqual(["update"]);
  });

  test("creates a directory page and uploads attachments after page creation", async () => {
    const stats = new PublishStats();
    const calls: string[] = [];
    const client = {
      async getPagesByTitle() {
        calls.push("lookup");
        return [];
      },
      async createPage() {
        calls.push("create-page");
        return { ok: true as const, id: "11" };
      },
      async getPageVersion() {
        return 1;
      },
      async updatePage() {
        calls.push("update-page");
        return { ok: true as const, id: "11" };
      },
      async listPageAttachments() {
        calls.push("list-attachments");
        return [];
      },
      async createAttachment() {
        calls.push("create-attachment");
        return { ok: true as const, id: "a1", title: "diagram.png" };
      },
      async updateAttachment() {
        calls.push("update-attachment");
        return { ok: true as const, id: "a1", title: "diagram.png" };
      },
    };

    const result = await publishDirectoryPage(client, stats, {
      title: "my-service (my-service)",
      html: "<p>Hello</p>",
      parentId: "901",
      attachments: [
        {
          filename: "diagram.png",
          contentType: "image/png",
          data: new Uint8Array([1, 2, 3]),
        },
      ],
    });

    expect(result).toEqual({
      pageId: "11",
      pageTitle: "my-service (my-service)",
      pageKind: "directory",
      pageOperation: "created",
      attachmentStrategy: "create-all",
      attachmentResults: [
        { attachmentId: "a1", filename: "diagram.png", operation: "created" },
      ],
    });
    expect(calls).toEqual(["lookup", "create-page", "create-attachment"]);
  });

  test("updates a file page and upserts attachments against existing binaries", async () => {
    const stats = new PublishStats();
    const calls: string[] = [];
    const client = {
      async getPagesByTitle() {
        calls.push("lookup");
        return [
          {
            id: "11",
            title: "Deployment (my-service)",
            ancestors: [{ id: "901" }],
          },
        ];
      },
      async createPage() {
        calls.push("create-page");
        return { ok: true as const, id: "11" };
      },
      async getPageVersion() {
        return 1;
      },
      async updatePage() {
        calls.push("update-page");
        return { ok: true as const, id: "11" };
      },
      async listPageAttachments() {
        calls.push("list-attachments");
        return [{ id: "a1", title: "diagram.png" }];
      },
      async createAttachment() {
        calls.push("create-attachment");
        return { ok: true as const, id: "a2", title: "missing.png" };
      },
      async updateAttachment() {
        calls.push("update-attachment");
        return { ok: true as const, id: "a1", title: "diagram.png" };
      },
    };

    const result = await publishFilePage(client, stats, {
      title: "Deployment (my-service)",
      html: "<p>Hello</p>",
      parentId: "901",
      attachments: [
        {
          filename: "diagram.png",
          contentType: "image/png",
          data: new Uint8Array([1, 2, 3]),
        },
        {
          filename: "missing.png",
          contentType: "image/png",
          data: new Uint8Array([4, 5, 6]),
        },
      ],
    });

    expect(result).toEqual({
      pageId: "11",
      pageTitle: "Deployment (my-service)",
      pageKind: "file",
      pageOperation: "updated",
      attachmentStrategy: "upsert-existing",
      attachmentResults: [
        { attachmentId: "a1", filename: "diagram.png", operation: "updated" },
        { attachmentId: "a2", filename: "missing.png", operation: "created" },
      ],
    });
    expect(calls).toEqual([
      "lookup",
      "update-page",
      "list-attachments",
      "update-attachment",
      "create-attachment",
    ]);
  });

  test("records attachment upload failures without throwing", async () => {
    const stats = new PublishStats();
    const client = {
      async getPagesByTitle() {
        return [];
      },
      async createPage() {
        return { ok: true as const, id: "11" };
      },
      async getPageVersion() {
        return 1;
      },
      async updatePage() {
        return { ok: true as const, id: "11" };
      },
      async listPageAttachments() {
        return [];
      },
      async createAttachment() {
        return {
          ok: false as const,
          statusCode: "500",
          body: '{"referralId":"ref-att"}',
        };
      },
      async updateAttachment() {
        return { ok: true as const, id: "a1", title: "diagram.png" };
      },
    };

    const result = await publishFilePage(client, stats, {
      title: "Deployment (my-service)",
      html: "<p>Hello</p>",
      parentId: "901",
      attachments: [
        {
          filename: "diagram.png",
          data: new Uint8Array([1, 2, 3]),
        },
      ],
    });

    expect(result).toBeUndefined();
    expect(stats.renderSummary()).toContain("attachment | upload");
    expect(stats.renderSummary()).toContain("ref-att");
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
