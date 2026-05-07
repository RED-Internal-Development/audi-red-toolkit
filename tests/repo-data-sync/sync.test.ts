import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import { executeRepoDataSync } from "../../actions/repo-data-sync/src/sync.js";

describe("repo-data-sync execution", () => {
  const tempRoots: string[] = [];

  afterAll(async () => {
    for (const root of tempRoots) {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("merges metadata and coverage fragments into report outputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "repo-data-sync-"));
    tempRoots.push(root);

    await mkdir(join(root, "metadata-report"), { recursive: true });
    await mkdir(join(root, "collection-report"), { recursive: true });
    await mkdir(join(root, "audired-cypress-report"), { recursive: true });
    await mkdir(join(root, "audired-jest-report"), { recursive: true });
    await mkdir(join(root, "data"), { recursive: true });

    await writeJson(join(root, "metadata-report", "metadata-report.json"), {
      "@oneaudi/fa-example": {
        app_name: "fa-example",
        default_branch: "main",
      },
    });
    await writeJson(join(root, "collection-report", "report.json"), {
      "@oneaudi/fa-example": {
        lighthouse_score: 0.91,
        unit_test_coverage: 70,
      },
    });
    await writeJson(join(root, "audired-cypress-report", "report.json"), {
      "@oneaudi/fa-example": {
        e2e_test_coverage: 62,
      },
    });
    await writeJson(join(root, "audired-jest-report", "report.json"), {
      "@oneaudi/fa-example": {
        unit_test_coverage: 88,
        unit_test_coverage_data: {
          line_coverage: 90,
          statement_coverage: 89,
          function_coverage: 87,
          branch_coverage: 86,
          average_coverage: 88,
        },
      },
    });
    await writeJson(join(root, "data", "report.json"), {
      "@oneaudi/other-app": {
        timestamp: "2024-01-01T00:00:00.000Z",
      },
      "@oneaudi/fa-example": {
        stale: true,
      },
    });

    const result = await executeRepoDataSync(
      {
        metadataFile: join(root, "metadata-report", "metadata-report.json"),
        collectionReportFile: join(root, "collection-report", "report.json"),
        cypressReportFile: join(root, "audired-cypress-report", "report.json"),
        jestReportFile: join(root, "audired-jest-report", "report.json"),
        dataDir: join(root, "data"),
        collectionOutputDir: join(root, "assembled-collection-report"),
        docsDestinationTeamFolder: "docs/feature-apps/payments",
        docsDestinationAppFolder: "docs/feature-apps/payments/fa-example",
        docsBranch: "release",
        appType: "feature_app",
        profileKey: "feature_app",
        prodSupportEnabled: true,
      },
      {
        now: () => new Date("2025-01-02T03:04:05.000Z"),
      },
    );

    const collectionReport = await readJson(result.reportFile);
    const sharedReport = await readJson(join(root, "data", "report.json"));
    const perRepoReport = await readJson(result.perRepoFile);
    const profileDashboardReport = await readJson(result.profileDashboardFile);

    expect(collectionReport).toEqual({
      "@oneaudi/fa-example": {
        app_name: "fa-example",
        default_branch: "main",
        lighthouse_score: 0.91,
        unit_test_coverage: 88,
        unit_test_coverage_data: {
          line_coverage: 90,
          statement_coverage: 89,
          function_coverage: 87,
          branch_coverage: 86,
          average_coverage: 88,
        },
        e2e_test_coverage: 62,
        prod_support_enabled: true,
        docs: {
          docs_destination_team_folder: "docs/feature-apps/payments",
          docs_destination_app_folder: "docs/feature-apps/payments/fa-example",
          docs_branch: "release",
        },
        timestamp: "2025-01-02T03:04:05.000Z",
      },
    });

    expect(sharedReport).toEqual({
      "@oneaudi/other-app": {
        timestamp: "2024-01-01T00:00:00.000Z",
      },
      "@oneaudi/fa-example": collectionReport["@oneaudi/fa-example"],
    });

    expect(result.perRepoFile.endsWith("_oneaudi_fa-example.json")).toBe(true);
    expect(perRepoReport).toEqual(collectionReport["@oneaudi/fa-example"]);

    expect(profileDashboardReport).toEqual({
      schemaVersion: "1.0",
      generatedAt: "2025-01-02T03:04:05.000Z",
      repositories: [
        {
          repository: {
            owner: "@oneaudi",
            name: "fa-example",
            fullName: "@oneaudi/fa-example",
            displayName: "fa-example",
          },
          appType: "feature_app",
          profileKey: "feature_app",
          generatedAt: "2025-01-02T03:04:05.000Z",
          metadata: {
            app_name: "fa-example",
            default_branch: "main",
            prod_support_enabled: true,
            docs: {
              docs_destination_team_folder: "docs/feature-apps/payments",
              docs_destination_app_folder:
                "docs/feature-apps/payments/fa-example",
              docs_branch: "release",
            },
          },
          metrics: {
            unitTest: {
              overallCoverage: 88,
              breakdown: {
                lines: 90,
                statements: 89,
                functions: 87,
                branches: 86,
              },
            },
            e2eCoverage: {
              overallCoverage: 62,
              breakdown: undefined,
            },
            lighthouse: {
              overallScore: 0.91,
            },
          },
          collectionStatus: {
            unitTest: { status: "found" },
            e2eCoverage: { status: "found" },
            lighthouse: { status: "found" },
          },
        },
      ],
    });
  });
});

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(filePath, "utf8")) as Record<
    string,
    unknown
  >;
}
