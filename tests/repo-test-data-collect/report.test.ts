import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import { collectCoverageReport } from "../../actions/repo-test-data-collect/src/collect.js";
import { buildCollectionReport } from "../../actions/repo-test-data-collect/src/report.js";

describe("repo-test-data-collect reporting", () => {
  const tempRoots: string[] = [];

  afterAll(async () => {
    for (const root of tempRoots) {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("builds a legacy-compatible report shape", () => {
    expect(
      buildCollectionReport({
        repoName: "@oneaudi/fa-example",
        lighthouseScore: 0.91,
        unitTestCoverage: 82.5,
        unitTestCoverageData: {
          line_coverage: 80,
          statement_coverage: 81,
          function_coverage: 82,
          branch_coverage: 87,
          average_coverage: 82.5,
        },
        e2eTestCoverage: 76,
        e2eTestCoverageBreakdown: {
          e2e_test_coverage_statements: 75,
          e2e_test_coverage_branches: 70,
          e2e_test_coverage_functions: 79,
          e2e_test_coverage_lines: 80,
        },
      }),
    ).toEqual({
      "@oneaudi/fa-example": {
        lighthouse_score: 0.91,
        unit_test_coverage: 82.5,
        unit_test_coverage_data: {
          line_coverage: 80,
          statement_coverage: 81,
          function_coverage: 82,
          branch_coverage: 87,
          average_coverage: 82.5,
        },
        e2e_test_coverage: 76,
        e2e_test_coverage_breakdown: {
          e2e_test_coverage_statements: 75,
          e2e_test_coverage_branches: 70,
          e2e_test_coverage_functions: 79,
          e2e_test_coverage_lines: 80,
        },
      },
    });
  });

  test("parses Cypress text-summary output into the legacy report fields", async () => {
    const originalCwd = process.cwd();
    const coverageRoot = await mkdtemp(join(tmpdir(), "repo-test-data-collect-nyc-"));
    tempRoots.push(coverageRoot);
    process.chdir(
      "/Users/jaydeepvachhani/red_repos/RED-Toolkit-New/fa-audired-test-app",
    );

    try {
      const report = await collectCoverageReport(
        {
          githubToken: "token",
          jestCoverageFilePath: "missing.json",
          lighthouseCoverageFilePath: "missing-lh.json",
          cypressCoverageTempDir: coverageRoot,
        },
        async () => ({
          exitCode: 0,
          stdout: [
            "Statements   : 78.5%",
            "Branches     : 61.5%",
            "Functions    : Unknown%",
            "Lines        : 80%",
          ].join("\n"),
          stderr: "",
        }),
      );

      expect(report).toEqual({
        "@oneaudi/fa-audired-test-app": {
          e2e_test_coverage: 55,
          e2e_test_coverage_breakdown: {
            e2e_test_coverage_statements: 78.5,
            e2e_test_coverage_branches: 61.5,
            e2e_test_coverage_functions: 0,
            e2e_test_coverage_lines: 80,
          },
        },
      });
    } finally {
      process.chdir(originalCwd);
    }
  });
});
