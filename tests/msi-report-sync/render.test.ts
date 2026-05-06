import { describe, expect, test } from "vitest";

import { renderConfluenceRepositoryReport } from "../../actions/msi-report-sync/src/render.js";

const report = {
  metadata: {
    generatedAt: "2026-04-28T10:00:00.000Z",
    source: "data/confluenceRepositoryReport.json",
    repositoryCount: 1,
    filterableColumns: ["repositoryName", "team"],
  },
  columns: [
    { key: "repositoryName", label: "Repository", type: "string" },
    { key: "team", label: "Team", type: "string" },
    { key: "repositoryUrl", label: "Repository URL", type: "string" },
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
};

describe("msi-report-sync renderer", () => {
  test("renders a native repository table", () => {
    const html = renderConfluenceRepositoryReport(report);

    expect(html).toContain("<h2>Summary</h2>");
    expect(html).toContain("<h2>Repository Report</h2>");
    expect(html).toContain("<table><thead><tr>");
    expect(html).toContain(
      '<a href="https://github.example/fa-example">@oneaudi/fa-example</a>',
    );
    expect(html).toContain(
      '<ac:parameter ac:name="title">Watch</ac:parameter>',
    );
    expect(html).toContain("Unit 82.50% | E2E 64.10% | LH 91.00%");
    expect(html).toContain('<ac:structured-macro ac:name="status">');
    expect(html).toContain(
      '<ac:parameter ac:name="title">Critical</ac:parameter>',
    );
    expect(html).toContain(
      "Total 3 | Critical 1 | High 1 | Moderate 1 | Low 0",
    );
    expect(html).toContain("2026-04-28");
  });
});
