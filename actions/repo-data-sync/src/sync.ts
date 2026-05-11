import * as core from "@actions/core";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ActionError } from "../../../packages/action-common/src/errors.js";
import {
  buildBackendServiceProfileDashboardEntryV1,
  buildFeatureAppProfileDashboardEntryV1,
  buildProfileDashboardReportV1,
  type E2eCoverageBreakdown,
  type ProfileDashboardCollectionStatusV1,
  type ProfileDashboardEntryV1,
  type UnitTestCoverageData,
} from "../../repo-test-data-collect/src/report.js";
import type { ReportSyncInputs } from "./inputs.js";

type JsonRecord = Record<string, unknown>;

interface TestCollectionMetricPolicy {
  enabled: boolean;
  collector?: string;
  required?: boolean;
  statusKey?: string;
  sourceFields?: string[];
}

type TestCollectionPolicy = Record<string, TestCollectionMetricPolicy>;

interface SyncRuntimeOptions {
  now?: () => Date;
}

export async function executeRepoDataSync(
  inputs: ReportSyncInputs,
  options: SyncRuntimeOptions = {},
): Promise<{
  reportFile: string;
  perRepoFile: string;
  profileDashboardFile: string;
  repoName: string;
}> {
  const metadataReport = await readRequiredReport(
    inputs.metadataFile,
    "metadata_file",
  );
  const repoName = extractRepoName(metadataReport);

  let repoEntry = readRepoEntry(metadataReport, repoName);
  repoEntry = await mergeOptionalReport(
    repoEntry,
    repoName,
    inputs.collectionReportFile,
    "collection_report_file",
  );
  repoEntry = await mergeOptionalReport(
    repoEntry,
    repoName,
    inputs.cypressReportFile,
    "cypress_report_file",
  );
  repoEntry = await mergeOptionalReport(
    repoEntry,
    repoName,
    inputs.lighthouseReportFile,
    "lighthouse_report_file",
  );
  repoEntry = await mergeOptionalReport(
    repoEntry,
    repoName,
    inputs.jestReportFile,
    "jest_report_file",
  );

  const timestamp = (options.now?.() ?? new Date()).toISOString();
  const finalRepoEntry: JsonRecord = {
    ...repoEntry,
    prod_support_enabled: inputs.prodSupportEnabled,
    docs: {
      docs_destination_team_folder: inputs.docsDestinationTeamFolder,
      docs_destination_app_folder: inputs.docsDestinationAppFolder,
      docs_branch: inputs.docsBranch,
    },
    timestamp,
  };

  const collectionOutputDir = resolve(inputs.collectionOutputDir);
  await mkdir(collectionOutputDir, { recursive: true });
  const reportFile = resolve(collectionOutputDir, "report.json");
  await writeJsonFile(reportFile, { [repoName]: finalRepoEntry });

  const dataDir = resolve(inputs.dataDir);
  const perRepoDir = resolve(dataDir, "per-repo");
  await mkdir(perRepoDir, { recursive: true });

  const sharedReportFile = resolve(dataDir, "report.json");
  const sharedReport = await readOptionalReport(sharedReportFile);
  sharedReport[repoName] = finalRepoEntry;
  await writeJsonFile(sharedReportFile, sharedReport);

  const perRepoFile = resolve(
    perRepoDir,
    `${toSafeRepoFileName(repoName)}.json`,
  );
  await writeJsonFile(perRepoFile, finalRepoEntry);

  const profileDashboardDir = resolve(dataDir, "profile-dashboard");
  await mkdir(profileDashboardDir, { recursive: true });
  const profileDashboardFile = resolve(profileDashboardDir, "report.json");
  const profileDashboardEntries =
    await readProfileDashboardEntries(profileDashboardFile);
  const profileDashboardEntry = buildProfileDashboardEntry(
    finalRepoEntry,
    repoName,
    timestamp,
    inputs,
  );
  const nextProfileDashboardEntries = upsertProfileDashboardEntry(
    profileDashboardEntries,
    profileDashboardEntry,
  );
  await writeJsonFile(
    profileDashboardFile,
    buildProfileDashboardReportV1({
      generatedAt: timestamp,
      repositories: nextProfileDashboardEntries,
    }),
  );

  return { reportFile, perRepoFile, profileDashboardFile, repoName };
}

async function mergeOptionalReport(
  repoEntry: JsonRecord,
  repoName: string,
  reportFilePath: string | undefined,
  inputName: string,
): Promise<JsonRecord> {
  if (!reportFilePath) {
    return repoEntry;
  }

  const reportExists = await pathExists(reportFilePath);
  if (!reportExists) {
    core.info(`${inputName} not found at ${reportFilePath}. Skipping.`);
    return repoEntry;
  }

  const report = await readRequiredReport(reportFilePath, inputName);
  const nextEntry = readRepoEntry(report, repoName);
  return Object.keys(nextEntry).length > 0
    ? { ...repoEntry, ...nextEntry }
    : repoEntry;
}

async function readRequiredReport(
  filePath: string,
  inputName: string,
): Promise<JsonRecord> {
  try {
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    return readObject(parsed, `${inputName} must contain a JSON object.`);
  } catch (error) {
    if (error instanceof ActionError) {
      throw error;
    }

    throw new ActionError(
      "REPORT_SYNC_INVALID_INPUT",
      "validate_inputs",
      `${inputName} must reference a readable JSON file.`,
    );
  }
}

async function readOptionalReport(filePath: string): Promise<JsonRecord> {
  if (!(await pathExists(filePath))) {
    return {};
  }

  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
  return readObject(parsed, "data/report.json must contain a JSON object.");
}

function extractRepoName(report: JsonRecord): string {
  const repoName = Object.keys(report)[0];
  if (!repoName) {
    throw new ActionError(
      "REPORT_SYNC_INVALID_INPUT",
      "validate_inputs",
      "metadata_file must contain at least one repository entry.",
    );
  }

  return repoName;
}

function readRepoEntry(report: JsonRecord, repoName: string): JsonRecord {
  const entry = report[repoName];
  return readObject(
    entry,
    `Report entry for ${repoName} must be a JSON object.`,
  );
}

function readObject(value: unknown, message: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ActionError(
      "REPORT_SYNC_INVALID_INPUT",
      "validate_inputs",
      message,
    );
  }

  return value as JsonRecord;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toSafeRepoFileName(repoName: string): string {
  return repoName.replace(/[/@ ]/g, "_");
}

async function readProfileDashboardEntries(
  filePath: string,
): Promise<ProfileDashboardEntryV1[]> {
  if (!(await pathExists(filePath))) {
    return [];
  }

  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
  const report = readObject(
    parsed,
    "profile-dashboard/report.json must contain a JSON object.",
  );
  const repositories = report.repositories;

  if (!Array.isArray(repositories)) {
    return [];
  }

  return repositories.filter(
    (entry): entry is ProfileDashboardEntryV1 =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
  );
}

function buildProfileDashboardEntry(
  finalRepoEntry: JsonRecord,
  repoName: string,
  timestamp: string,
  inputs: ReportSyncInputs,
): ProfileDashboardEntryV1 {
  const appType = normalizeProfileDashboardAppType(inputs.appType);
  const profileKey = inputs.profileKey?.trim() || appType;
  const testCollectionPolicy = parseTestCollectionPolicy(
    inputs.testCollectionPolicy,
    appType,
  );
  const metadata = buildProfileDashboardMetadata(finalRepoEntry);
  const collectionStatus = buildCollectionStatus(
    finalRepoEntry,
    testCollectionPolicy,
  );
  const unitTestCoverage = readOptionalNumber(
    finalRepoEntry.unit_test_coverage,
  );
  const unitTestCoverageData = readOptionalUnitTestCoverageData(
    finalRepoEntry.unit_test_coverage_data,
  );

  if (appType === "backend_service") {
    return buildBackendServiceProfileDashboardEntryV1({
      repoName,
      generatedAt: timestamp,
      profileKey,
      metadata,
      unitTestCoverage,
      unitTestCoverageData,
      collectionStatus,
    });
  }

  return buildFeatureAppProfileDashboardEntryV1({
    repoName,
    generatedAt: timestamp,
    profileKey,
    metadata,
    unitTestCoverage,
    unitTestCoverageData,
    e2eTestCoverage: readOptionalNumber(finalRepoEntry.e2e_test_coverage),
    e2eTestCoverageBreakdown: readOptionalE2eCoverageBreakdown(
      finalRepoEntry.e2e_test_coverage_breakdown,
    ),
    lighthouseScore: readOptionalNumber(finalRepoEntry.lighthouse_score),
    collectionStatus,
  });
}

function normalizeProfileDashboardAppType(
  appType: string | undefined,
): "feature_app" | "backend_service" {
  return appType === "backend_service" ? "backend_service" : "feature_app";
}

function buildProfileDashboardMetadata(finalRepoEntry: JsonRecord): JsonRecord {
  const {
    lighthouse_score: _lighthouseScore,
    unit_test_coverage: _unitTestCoverage,
    unit_test_coverage_data: _unitTestCoverageData,
    e2e_test_coverage: _e2eTestCoverage,
    e2e_test_coverage_breakdown: _e2eTestCoverageBreakdown,
    timestamp: _timestamp,
    ...metadata
  } = finalRepoEntry;

  return metadata;
}

function buildCollectionStatus(
  finalRepoEntry: JsonRecord,
  testCollectionPolicy: TestCollectionPolicy,
): Record<string, ProfileDashboardCollectionStatusV1> | undefined {
  const status: Record<string, ProfileDashboardCollectionStatusV1> = {};

  for (const [metricName, metricPolicy] of Object.entries(
    testCollectionPolicy,
  )) {
    const statusKey = metricPolicy.statusKey?.trim() || toStatusKey(metricName);
    const sourceFields = metricPolicy.sourceFields ?? [];

    if (!metricPolicy.enabled) {
      status[statusKey] = { status: "not_configured" };
      continue;
    }

    const metricFound = hasAnyMetric(
      ...sourceFields.map((fieldName) => finalRepoEntry[fieldName]),
    );

    status[statusKey] = metricFound
      ? { status: "found" }
      : { status: "missing" };
  }

  return Object.keys(status).length > 0 ? status : undefined;
}

function parseTestCollectionPolicy(
  rawPolicy: string | undefined,
  appType: "feature_app" | "backend_service",
): TestCollectionPolicy {
  if (!rawPolicy) {
    return buildLegacyTestCollectionPolicy(appType);
  }

  try {
    const parsed: unknown = JSON.parse(rawPolicy);
    const record = readObject(
      parsed,
      "test_collection_policy must contain a JSON object.",
    );
    const policy: TestCollectionPolicy = {};

    for (const [metricName, metricValue] of Object.entries(record)) {
      const metricPolicyRecord = readObject(
        metricValue,
        `test_collection_policy.${metricName} must be a JSON object.`,
      );
      const enabled = metricPolicyRecord.enabled === true;
      const collector = readOptionalString(metricPolicyRecord.collector);
      const required =
        typeof metricPolicyRecord.required === "boolean"
          ? metricPolicyRecord.required
          : undefined;
      const statusKey = readOptionalString(metricPolicyRecord.status_key);
      const sourceFields = readOptionalStringArray(
        metricPolicyRecord.source_fields,
      );

      policy[metricName] = {
        enabled,
        collector,
        required,
        statusKey,
        sourceFields,
      };
    }

    return policy;
  } catch (error) {
    if (error instanceof ActionError) {
      throw error;
    }

    throw new ActionError(
      "REPORT_SYNC_INVALID_INPUT",
      "validate_inputs",
      "test_collection_policy must reference valid JSON.",
    );
  }
}

function buildLegacyTestCollectionPolicy(
  appType: "feature_app" | "backend_service",
): TestCollectionPolicy {
  const policy: TestCollectionPolicy = {
    unit_test: {
      enabled: true,
      statusKey: "unitTest",
      sourceFields: ["unit_test_coverage", "unit_test_coverage_data"],
    },
  };

  if (appType === "feature_app") {
    policy.e2e_coverage = {
      enabled: true,
      statusKey: "e2eCoverage",
      sourceFields: ["e2e_test_coverage", "e2e_test_coverage_breakdown"],
    };
    policy.lighthouse = {
      enabled: true,
      statusKey: "lighthouse",
      sourceFields: ["lighthouse_score"],
    };
  }

  return policy;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );

  return items.length > 0 ? items : undefined;
}

function toStatusKey(metricName: string): string {
  return metricName.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

function hasAnyMetric(...values: unknown[]): boolean {
  return values.some((value) => value !== undefined);
}

function upsertProfileDashboardEntry(
  entries: ProfileDashboardEntryV1[],
  nextEntry: ProfileDashboardEntryV1,
): ProfileDashboardEntryV1[] {
  const nextEntries = [...entries];
  const entryIndex = nextEntries.findIndex(
    (entry) => entry.repository.fullName === nextEntry.repository.fullName,
  );

  if (entryIndex >= 0) {
    nextEntries[entryIndex] = nextEntry;
    return nextEntries;
  }

  nextEntries.push(nextEntry);
  return nextEntries;
}

function readOptionalNumber(value: unknown): number | null | undefined {
  return typeof value === "number" ? value : undefined;
}

function readOptionalUnitTestCoverageData(
  value: unknown,
): UnitTestCoverageData | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.line_coverage !== "number" ||
    typeof record.statement_coverage !== "number" ||
    typeof record.function_coverage !== "number" ||
    typeof record.branch_coverage !== "number" ||
    typeof record.average_coverage !== "number"
  ) {
    return undefined;
  }

  return {
    line_coverage: record.line_coverage,
    statement_coverage: record.statement_coverage,
    function_coverage: record.function_coverage,
    branch_coverage: record.branch_coverage,
    average_coverage: record.average_coverage,
  };
}

function readOptionalE2eCoverageBreakdown(
  value: unknown,
): E2eCoverageBreakdown | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.e2e_test_coverage_statements !== "number" ||
    typeof record.e2e_test_coverage_branches !== "number" ||
    typeof record.e2e_test_coverage_functions !== "number" ||
    typeof record.e2e_test_coverage_lines !== "number"
  ) {
    return undefined;
  }

  return {
    e2e_test_coverage_statements: record.e2e_test_coverage_statements,
    e2e_test_coverage_branches: record.e2e_test_coverage_branches,
    e2e_test_coverage_functions: record.e2e_test_coverage_functions,
    e2e_test_coverage_lines: record.e2e_test_coverage_lines,
  };
}
