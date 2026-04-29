export interface ConfluenceRepositoryReportColumn {
  key: string;
  label: string;
  type: string;
}

export interface ConfluenceRepositoryReportRow {
  repositoryName: string;
  team: string | null;
  supplier: string | null;
  releaseTrain: string | null;
  publishedVersion: string | null;
  repositoryUrl: string | null;
  timestamp: string | null;
  unitTestCoverage: number | null;
  e2eTestCoverage: number | null;
  lighthouseScore: number | null;
  dependabotPullRequests: number;
  totalVulnerabilities: number;
  criticalVulnerabilities: number;
  highVulnerabilities: number;
  moderateVulnerabilities: number;
  lowVulnerabilities: number;
  hasScanResults: boolean;
  productionSupportEnabled: boolean;
}

export interface ConfluenceRepositoryReportData {
  metadata: {
    generatedAt: string;
    source: string;
    repositoryCount: number;
    filterableColumns: string[];
  };
  columns: ConfluenceRepositoryReportColumn[];
  summary: {
    repositoryCount: number;
    teamCount: number;
    supplierCount: number;
    productionSupportCount: number;
    dependabotPullRequestCount: number;
    totalVulnerabilities: number;
    criticalVulnerabilities: number;
    highVulnerabilities: number;
    moderateVulnerabilities: number;
    lowVulnerabilities: number;
  };
  rows: ConfluenceRepositoryReportRow[];
}

const DISPLAY_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "repository", label: "Repository" },
  { key: "team", label: "Team" },
  { key: "supplier", label: "Supplier" },
  { key: "releaseTrain", label: "ART" },
  { key: "publishedVersion", label: "Published Version" },
  { key: "timestamp", label: "Last Update" },
  { key: "quality", label: "Quality" },
  { key: "dependabotPullRequests", label: "Dependabot PRs" },
  { key: "vulnerabilities", label: "Vulnerabilities" },
  { key: "hasScanResults", label: "ScanOSS" },
];

export function renderConfluenceRepositoryReport(
  report: ConfluenceRepositoryReportData,
): string {
  const summaryTable = renderSummaryTable(report);
  const repositoryTable = renderRepositoryTable(report);

  return [
    `<p><strong>Generated:</strong> ${escapeHtml(report.metadata.generatedAt)}</p>`,
    `<p><strong>Source:</strong> ${escapeHtml(report.metadata.source)}</p>`,
    "<h2>Summary</h2>",
    summaryTable,
    "<h2>Repository Report</h2>",
    repositoryTable,
  ].join("");
}

function renderSummaryTable(report: ConfluenceRepositoryReportData): string {
  const summaryRows: Array<[string, string]> = [
    ["Repositories", String(report.summary.repositoryCount)],
    ["Teams", String(report.summary.teamCount)],
    ["Suppliers", String(report.summary.supplierCount)],
    ["Production Support", String(report.summary.productionSupportCount)],
    ["Dependabot PRs", String(report.summary.dependabotPullRequestCount)],
    ["Total Vulnerabilities", String(report.summary.totalVulnerabilities)],
    ["Critical", String(report.summary.criticalVulnerabilities)],
    ["High", String(report.summary.highVulnerabilities)],
    ["Moderate", String(report.summary.moderateVulnerabilities)],
    ["Low", String(report.summary.lowVulnerabilities)],
  ];

  return [
    "<table><tbody>",
    ...summaryRows.map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    ),
    "</tbody></table>",
  ].join("");
}

function renderRepositoryTable(report: ConfluenceRepositoryReportData): string {
  return [
    "<table><thead><tr>",
    ...DISPLAY_COLUMNS.map((column) => `<th>${escapeHtml(column.label)}</th>`),
    "</tr></thead><tbody>",
    ...report.rows.map((row) => renderRepositoryRow(row)),
    "</tbody></table>",
  ].join("");
}

function renderRepositoryRow(row: ConfluenceRepositoryReportRow): string {
  const cells = DISPLAY_COLUMNS.map((column) => {
    const value = getColumnValue(column.key, row);
    return `<td>${value}</td>`;
  });

  return `<tr>${cells.join("")}</tr>`;
}

function getColumnValue(
  columnKey: string,
  row: ConfluenceRepositoryReportRow,
): string {
  switch (columnKey) {
    case "repository":
      return row.repositoryUrl
        ? `<a href="${escapeAttribute(row.repositoryUrl)}">${escapeHtml(row.repositoryName)}</a>`
        : escapeHtml(row.repositoryName);
    case "team":
      return escapeHtml(orFallback(row.team));
    case "supplier":
      return escapeHtml(orFallback(row.supplier));
    case "releaseTrain":
      return escapeHtml(orFallback(row.releaseTrain));
    case "publishedVersion":
      return escapeHtml(orFallback(row.publishedVersion));
    case "timestamp":
      return escapeHtml(formatTimestamp(row.timestamp));
    case "quality":
      return [
        renderQualityStatus(row),
        escapeHtml(
          [
            `Unit ${formatPercentage(row.unitTestCoverage)}`,
            `E2E ${formatPercentage(row.e2eTestCoverage)}`,
            `LH ${formatPercentage(row.lighthouseScore)}`,
          ].join(" | "),
        ),
      ].join(" ");
    case "dependabotPullRequests":
      return escapeHtml(String(row.dependabotPullRequests));
    case "vulnerabilities":
      return [
        renderSeverityStatus(row),
        escapeHtml(
          [
            `Total ${row.totalVulnerabilities}`,
            `Critical ${row.criticalVulnerabilities}`,
            `High ${row.highVulnerabilities}`,
            `Moderate ${row.moderateVulnerabilities}`,
            `Low ${row.lowVulnerabilities}`,
          ].join(" | "),
        ),
      ].join(" ");
    case "hasScanResults":
      return escapeHtml(row.hasScanResults ? "Enabled" : "Pending");
    default:
      return "N/A";
  }
}

function formatPercentage(value: number | null): string {
  if (value === null) {
    return "N/A";
  }

  return `${value.toFixed(2)}%`;
}

function orFallback(value: string | null): string {
  return value && value.trim().length > 0 ? value : "N/A";
}

function formatTimestamp(value: string | null): string {
  if (!value || value.trim().length === 0) {
    return "N/A";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 10);
}

function renderSeverityStatus(row: ConfluenceRepositoryReportRow): string {
  if (row.criticalVulnerabilities > 0) {
    return renderStatusMacro("Critical", "Red");
  }

  if (row.highVulnerabilities > 0) {
    return renderStatusMacro("High", "Yellow");
  }

  if (row.moderateVulnerabilities > 0) {
    return renderStatusMacro("Moderate", "Blue");
  }

  if (row.lowVulnerabilities > 0) {
    return renderStatusMacro("Low", "Grey");
  }

  return renderStatusMacro("Clear", "Green");
}

function renderQualityStatus(row: ConfluenceRepositoryReportRow): string {
  const scores = [
    row.unitTestCoverage,
    row.e2eTestCoverage,
    row.lighthouseScore,
  ].filter((value): value is number => value !== null);

  if (scores.length === 0) {
    return renderStatusMacro("Unscored", "Grey");
  }

  const lowestScore = Math.min(...scores);

  if (lowestScore >= 90) {
    return renderStatusMacro("Strong", "Green");
  }

  if (lowestScore >= 75) {
    return renderStatusMacro("Good", "Blue");
  }

  if (lowestScore >= 50) {
    return renderStatusMacro("Watch", "Yellow");
  }

  return renderStatusMacro("Weak", "Red");
}

function renderStatusMacro(title: string, colour: string): string {
  return [
    '<ac:structured-macro ac:name="status">',
    `<ac:parameter ac:name="title">${escapeHtml(title)}</ac:parameter>`,
    `<ac:parameter ac:name="colour">${escapeHtml(colour)}</ac:parameter>`,
    "</ac:structured-macro>",
  ].join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
