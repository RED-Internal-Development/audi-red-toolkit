import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, describe, expect, test } from "vitest";

import type { ConfluenceClient } from "../../actions/msi-sync/src/confluence-client.js";
import type { MsiReportSyncInputs } from "../../actions/msi-report-sync/src/inputs.js";
import { executeMsiReportSync } from "../../actions/msi-report-sync/src/index.js";

describe("msi-report-sync orchestration", () => {
  let workspaceRoot = "";
  let summaryPath = "";
  const workspaceRoots: string[] = [];

  afterEach(() => {
    delete process.env.GITHUB_STEP_SUMMARY;
    workspaceRoot = "";
    summaryPath = "";
  });

  afterAll(async () => {
    for (const root of workspaceRoots) {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("publishes the report page and uploads source attachments", async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "msi-report-sync-"));
    workspaceRoots.push(workspaceRoot);
    summaryPath = join(workspaceRoot, "summary.md");
    process.env.GITHUB_STEP_SUMMARY = summaryPath;
    await writeFile(summaryPath, "", "utf8");

    const dataFile = join(workspaceRoot, "confluenceRepositoryReport.json");
    const csvFile = join(workspaceRoot, "confluenceRepositoryReport.csv");

    await writeFile(
      dataFile,
      JSON.stringify({
        metadata: {
          generatedAt: "2026-04-28T10:00:00.000Z",
          source: "data/report.json",
          repositoryCount: 1,
          filterableColumns: ["repositoryName"],
        },
        columns: [
          { key: "repositoryName", label: "Repository", type: "string" },
        ],
        summary: {
          repositoryCount: 1,
          teamCount: 1,
          supplierCount: 1,
          productionSupportCount: 0,
          dependabotPullRequestCount: 2,
          totalVulnerabilities: 3,
          criticalVulnerabilities: 1,
          highVulnerabilities: 1,
          moderateVulnerabilities: 1,
          lowVulnerabilities: 0,
        },
        rows: [
          {
            repositoryName: "@oneaudi/fa-example",
            team: "Team A",
            supplier: "Supplier A",
            releaseTrain: "ART-1",
            publishedVersion: "1.0.0",
            repositoryUrl: "https://github.example/fa-example",
            timestamp: "2026-04-28",
            unitTestCoverage: 82.5,
            e2eTestCoverage: 64.1,
            lighthouseScore: 91,
            dependabotPullRequests: 2,
            totalVulnerabilities: 3,
            criticalVulnerabilities: 1,
            highVulnerabilities: 1,
            moderateVulnerabilities: 1,
            lowVulnerabilities: 0,
            hasScanResults: true,
            productionSupportEnabled: false,
          },
        ],
      }),
      "utf8",
    );
    await writeFile(csvFile, "Repository,Team\nexample,Team A\n", "utf8");

    const uploadedFiles: string[] = [];
    const pageBodies: string[] = [];
    const client: ConfluenceClient = {
      async getPagesByTitle() {
        return [];
      },
      async getPageById() {
        return { id: "page-1", title: "oneAudi FA Repository Report" };
      },
      async getPageVersion() {
        return 1;
      },
      async createPage(input) {
        pageBodies.push(input.html);
        return { ok: true, id: "page-1", title: input.title };
      },
      async updatePage() {
        throw new Error("updatePage should not be called");
      },
      async listPageAttachments() {
        return [];
      },
      async createAttachment(input) {
        uploadedFiles.push(input.filename);
        return { ok: true, id: `att-${input.filename}`, title: input.filename };
      },
      async updateAttachment() {
        throw new Error("updateAttachment should not be called");
      },
    };

    const inputs: MsiReportSyncInputs = {
      dataFile,
      pageTitle: "oneAudi FA Repository Report",
      parentPageId: "901",
      targetPageId: undefined,
      baseUrl: "https://example.invalid/confluence",
      spaceKey: "AAA",
      token: "token",
      csvFile,
    };

    const result = await executeMsiReportSync(inputs, {
      createClient: () => client,
    });

    expect(result).toEqual({ pageId: "page-1", attachmentCount: 2 });
    expect(uploadedFiles).toEqual([
      "confluenceRepositoryReport.json",
      "confluenceRepositoryReport.csv",
    ]);
    expect(pageBodies[0]).toContain("<table><thead><tr>");
    expect(pageBodies[0]).toContain("@oneaudi/fa-example");
    await expect(readFile(summaryPath, "utf8")).resolves.toContain(
      "status | success",
    );
  });

  test("updates a fixed target page id", async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "msi-report-sync-fixed-"));
    workspaceRoots.push(workspaceRoot);
    summaryPath = join(workspaceRoot, "summary-fixed.md");
    process.env.GITHUB_STEP_SUMMARY = summaryPath;
    await writeFile(summaryPath, "", "utf8");

    const dataFile = join(workspaceRoot, "confluenceRepositoryReport.json");
    await writeFile(
      dataFile,
      JSON.stringify({
        metadata: {
          generatedAt: "2026-04-28T10:00:00.000Z",
          source: "data/report.json",
          repositoryCount: 1,
          filterableColumns: ["repositoryName"],
        },
        columns: [
          { key: "repositoryName", label: "Repository", type: "string" },
        ],
        summary: {
          repositoryCount: 1,
          teamCount: 1,
          supplierCount: 1,
          productionSupportCount: 0,
          dependabotPullRequestCount: 2,
          totalVulnerabilities: 3,
          criticalVulnerabilities: 1,
          highVulnerabilities: 1,
          moderateVulnerabilities: 1,
          lowVulnerabilities: 0,
        },
        rows: [
          {
            repositoryName: "@oneaudi/fa-example",
            team: "Team A",
            supplier: "Supplier A",
            releaseTrain: "ART-1",
            publishedVersion: "1.0.0",
            repositoryUrl: "https://github.example/fa-example",
            timestamp: "2026-04-28",
            unitTestCoverage: 82.5,
            e2eTestCoverage: 64.1,
            lighthouseScore: 91,
            dependabotPullRequests: 2,
            totalVulnerabilities: 3,
            criticalVulnerabilities: 1,
            highVulnerabilities: 1,
            moderateVulnerabilities: 1,
            lowVulnerabilities: 0,
            hasScanResults: true,
            productionSupportEnabled: false,
          },
        ],
      }),
      "utf8",
    );

    const calls: string[] = [];
    const client: ConfluenceClient = {
      async getPagesByTitle() {
        calls.push("getPagesByTitle");
        return [];
      },
      async getPageById(pageId) {
        calls.push(`getPageById:${pageId}`);
        return { id: pageId, title: "Feature App Repository Report" };
      },
      async getPageVersion() {
        return 1;
      },
      async createPage() {
        throw new Error("createPage should not be called");
      },
      async updatePage(input) {
        calls.push(`updatePage:${input.id}`);
        return { ok: true, id: input.id, title: input.title };
      },
      async listPageAttachments(pageId) {
        calls.push(`listPageAttachments:${pageId}`);
        return [];
      },
      async createAttachment(input) {
        calls.push(`createAttachment:${input.filename}`);
        return { ok: true, id: `att-${input.filename}`, title: input.filename };
      },
      async updateAttachment() {
        throw new Error("updateAttachment should not be called");
      },
    };

    const result = await executeMsiReportSync(
      {
        dataFile,
        pageTitle: undefined,
        parentPageId: undefined,
        targetPageId: "1941410045",
        baseUrl: "https://example.invalid/confluence",
        spaceKey: "AAA",
        token: "token",
        csvFile: undefined,
      },
      { createClient: () => client },
    );

    expect(result).toEqual({ pageId: "1941410045", attachmentCount: 1 });
    expect(calls).toEqual([
      "getPageById:1941410045",
      "updatePage:1941410045",
      "listPageAttachments:1941410045",
      "createAttachment:confluenceRepositoryReport.json",
    ]);
  });
});
