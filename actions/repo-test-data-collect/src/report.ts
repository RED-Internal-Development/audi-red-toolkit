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

export interface ProfileDashboardReportV1 {
  schemaVersion: string;
  generatedAt: string;
  repositories: ProfileDashboardEntryV1[];
}

export interface ProfileDashboardRepositoryRefV1 {
  owner: string;
  name: string;
  fullName: string;
  displayName?: string;
}

export interface ProfileDashboardCollectionStatusV1 {
  status: "found" | "missing" | "failed" | "not_configured";
  message?: string;
}

export interface ProfileDashboardMetricBreakdownV1 {
  lines?: number | null;
  statements?: number | null;
  functions?: number | null;
  branches?: number | null;
}

export interface ProfileDashboardUnitTestMetricsV1 {
  overallCoverage: number | null;
  breakdown?: ProfileDashboardMetricBreakdownV1;
}

export interface ProfileDashboardE2eCoverageMetricsV1 {
  overallCoverage: number | null;
  breakdown?: ProfileDashboardMetricBreakdownV1;
}

export interface ProfileDashboardFeatureAppMetricsV1 {
  unitTest: ProfileDashboardUnitTestMetricsV1;
  e2eCoverage?: ProfileDashboardE2eCoverageMetricsV1;
  lighthouse?: {
    overallScore: number | null;
  };
  dependencySecurity?: Record<string, unknown>;
  releaseHealth?: Record<string, unknown>;
}

export interface ProfileDashboardBackendServiceMetricsV1 {
  unitTest: ProfileDashboardUnitTestMetricsV1;
  dependencySecurity?: Record<string, unknown>;
  releaseHealth?: Record<string, unknown>;
}

export interface FeatureAppProfileDashboardEntryV1 {
  repository: ProfileDashboardRepositoryRefV1;
  appType: "feature_app";
  profileKey: string;
  generatedAt: string;
  metadata: Record<string, unknown>;
  metrics: ProfileDashboardFeatureAppMetricsV1;
  collectionStatus?: Record<string, ProfileDashboardCollectionStatusV1>;
  dashboardSections?: string[];
}

export interface BackendServiceProfileDashboardEntryV1 {
  repository: ProfileDashboardRepositoryRefV1;
  appType: "backend_service";
  profileKey: string;
  generatedAt: string;
  metadata: Record<string, unknown>;
  metrics: ProfileDashboardBackendServiceMetricsV1;
  collectionStatus?: Record<string, ProfileDashboardCollectionStatusV1>;
  dashboardSections?: string[];
}

export type ProfileDashboardEntryV1 =
  | FeatureAppProfileDashboardEntryV1
  | BackendServiceProfileDashboardEntryV1;

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

export function buildProfileDashboardReportV1(input: {
  generatedAt: string;
  repositories: ProfileDashboardEntryV1[];
}): ProfileDashboardReportV1 {
  return {
    schemaVersion: "1.0",
    generatedAt: input.generatedAt,
    repositories: input.repositories,
  };
}

export function buildFeatureAppProfileDashboardEntryV1(input: {
  repoName: string;
  generatedAt: string;
  profileKey?: string;
  metadata?: Record<string, unknown>;
  unitTestCoverage?: number | null;
  unitTestCoverageData?: UnitTestCoverageData | null;
  e2eTestCoverage?: number | null;
  e2eTestCoverageBreakdown?: E2eCoverageBreakdown | null;
  lighthouseScore?: number | null;
  collectionStatus?: Record<string, ProfileDashboardCollectionStatusV1>;
  dashboardSections?: string[];
}): FeatureAppProfileDashboardEntryV1 {
  return {
    repository: buildRepositoryRefV1(input.repoName),
    appType: "feature_app",
    profileKey: input.profileKey ?? "feature_app",
    generatedAt: input.generatedAt,
    metadata: input.metadata ?? {},
    metrics: {
      unitTest: buildUnitTestMetricsV1(
        input.unitTestCoverage,
        input.unitTestCoverageData,
      ),
      e2eCoverage:
        input.e2eTestCoverage !== undefined ||
        input.e2eTestCoverageBreakdown !== undefined
          ? buildE2eCoverageMetricsV1(
              input.e2eTestCoverage,
              input.e2eTestCoverageBreakdown,
            )
          : undefined,
      lighthouse:
        input.lighthouseScore !== undefined
          ? { overallScore: input.lighthouseScore ?? null }
          : undefined,
    },
    collectionStatus: input.collectionStatus,
    dashboardSections: input.dashboardSections,
  };
}

export function buildBackendServiceProfileDashboardEntryV1(input: {
  repoName: string;
  generatedAt: string;
  profileKey?: string;
  metadata?: Record<string, unknown>;
  unitTestCoverage?: number | null;
  unitTestCoverageData?: UnitTestCoverageData | null;
  collectionStatus?: Record<string, ProfileDashboardCollectionStatusV1>;
  dashboardSections?: string[];
}): BackendServiceProfileDashboardEntryV1 {
  return {
    repository: buildRepositoryRefV1(input.repoName),
    appType: "backend_service",
    profileKey: input.profileKey ?? "backend_service",
    generatedAt: input.generatedAt,
    metadata: input.metadata ?? {},
    metrics: {
      unitTest: buildUnitTestMetricsV1(
        input.unitTestCoverage,
        input.unitTestCoverageData,
      ),
    },
    collectionStatus: input.collectionStatus,
    dashboardSections: input.dashboardSections,
  };
}

function buildRepositoryRefV1(
  repoName: string,
): ProfileDashboardRepositoryRefV1 {
  const [owner = repoName, name = repoName] = repoName.split("/");

  return {
    owner,
    name,
    fullName: repoName,
    displayName: name,
  };
}

function buildUnitTestMetricsV1(
  unitTestCoverage: number | null | undefined,
  unitTestCoverageData: UnitTestCoverageData | null | undefined,
): ProfileDashboardUnitTestMetricsV1 {
  return {
    overallCoverage: unitTestCoverage ?? null,
    breakdown: unitTestCoverageData
      ? {
          lines: unitTestCoverageData.line_coverage,
          statements: unitTestCoverageData.statement_coverage,
          functions: unitTestCoverageData.function_coverage,
          branches: unitTestCoverageData.branch_coverage,
        }
      : undefined,
  };
}

function buildE2eCoverageMetricsV1(
  e2eTestCoverage: number | null | undefined,
  e2eTestCoverageBreakdown: E2eCoverageBreakdown | null | undefined,
): ProfileDashboardE2eCoverageMetricsV1 {
  return {
    overallCoverage: e2eTestCoverage ?? null,
    breakdown: e2eTestCoverageBreakdown
      ? {
          lines: e2eTestCoverageBreakdown.e2e_test_coverage_lines,
          statements: e2eTestCoverageBreakdown.e2e_test_coverage_statements,
          functions: e2eTestCoverageBreakdown.e2e_test_coverage_functions,
          branches: e2eTestCoverageBreakdown.e2e_test_coverage_branches,
        }
      : undefined,
  };
}
