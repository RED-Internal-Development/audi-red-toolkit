export interface UnitTestCoverageData {
  line_coverage: number;
  statement_coverage: number;
  function_coverage: number;
  branch_coverage: number;
  average_coverage: number;
}

export interface E2eCoverageBreakdown {
  e2e_test_coverage_statements: number;
  e2e_test_coverage_branches: number;
  e2e_test_coverage_functions: number;
  e2e_test_coverage_lines: number;
}

export interface CollectionMetrics {
  repoName: string;
  lighthouseScore?: number | null;
  unitTestCoverage?: number | null;
  unitTestCoverageData?: UnitTestCoverageData | null;
  e2eTestCoverage?: number | null;
  e2eTestCoverageBreakdown?: E2eCoverageBreakdown | null;
}

export type CollectionReport = Record<string, Record<string, unknown>>;

export function buildCollectionReport(
  metrics: CollectionMetrics,
): CollectionReport {
  const entry: Record<string, unknown> = {};

  if (metrics.lighthouseScore !== undefined) {
    entry.lighthouse_score = metrics.lighthouseScore;
  }

  if (metrics.unitTestCoverage !== undefined) {
    entry.unit_test_coverage = metrics.unitTestCoverage;
  }

  if (metrics.unitTestCoverageData !== undefined) {
    entry.unit_test_coverage_data = metrics.unitTestCoverageData;
  }

  if (metrics.e2eTestCoverage !== undefined) {
    entry.e2e_test_coverage = metrics.e2eTestCoverage;
  }

  if (metrics.e2eTestCoverageBreakdown !== undefined) {
    entry.e2e_test_coverage_breakdown = metrics.e2eTestCoverageBreakdown;
  }

  return {
    [metrics.repoName]: entry,
  };
}

export function calculateAverageCoverage(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
