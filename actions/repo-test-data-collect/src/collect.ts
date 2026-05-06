import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { readFile, stat } from "node:fs/promises";

import { ActionError } from "../../../packages/action-common/src/errors.js";
import type { CollectionSyncInputs } from "./inputs.js";
import {
  buildCollectionReport,
  calculateAverageCoverage,
  type CollectionReport,
  type E2eCoverageBreakdown,
  type UnitTestCoverageData,
} from "./report.js";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
) => Promise<CommandResult>;

export async function collectCoverageReport(
  inputs: CollectionSyncInputs,
  runner: CommandRunner = defaultCommandRunner,
): Promise<CollectionReport> {
  const packageJsonText = await readFile("package.json", "utf8").catch(() => {
    throw new ActionError(
      "COLLECTION_INVALID_INPUT",
      "validate_inputs",
      "package.json is required in the repository root.",
    );
  });
  const repoName = resolveRepoName(packageJsonText);

  const unit = await collectJestCoverage(inputs.jestCoverageFilePath);
  const lighthouse = await collectLighthouseScore(
    inputs.lighthouseCoverageFilePath,
  );
  const e2e = await collectCypressCoverage(
    inputs.cypressCoverageTempDir,
    runner,
  );

  return buildCollectionReport({
    repoName,
    lighthouseScore: lighthouse,
    unitTestCoverage:
      unit?.average_coverage ?? (unit ? unit.average_coverage : undefined),
    unitTestCoverageData: unit,
    e2eTestCoverage: e2e?.averageCoverage,
    e2eTestCoverageBreakdown: e2e?.breakdown,
  });
}

async function collectJestCoverage(
  coverageFilePath: string,
): Promise<UnitTestCoverageData | undefined> {
  const fileExists = await pathExists(coverageFilePath);
  if (!fileExists) {
    core.info(
      `${coverageFilePath} not found. Skipping Jest coverage collection.`,
    );
    return undefined;
  }

  const raw = await readFile(coverageFilePath, "utf8");
  const parsed = parseJsonRecord(raw);
  const total = readObject(parsed.total);

  const lineCoverage = readPct(total.lines);
  const statementCoverage = readPct(total.statements);
  const functionCoverage = readPct(total.functions);
  const branchCoverage = readPct(total.branches);
  const averageCoverage = calculateAverageCoverage([
    lineCoverage,
    statementCoverage,
    functionCoverage,
    branchCoverage,
  ]);

  return {
    line_coverage: lineCoverage,
    statement_coverage: statementCoverage,
    function_coverage: functionCoverage,
    branch_coverage: branchCoverage,
    average_coverage: averageCoverage,
  };
}

async function collectLighthouseScore(
  lighthouseFilePath: string,
): Promise<number | null | undefined> {
  const fileExists = await pathExists(lighthouseFilePath);
  if (!fileExists) {
    core.info(
      `${lighthouseFilePath} not found. Skipping Lighthouse collection.`,
    );
    return undefined;
  }

  const raw = await readFile(lighthouseFilePath, "utf8");
  const parsed = parseJsonArray(raw);
  const first = parsed[0];
  if (!first) {
    return null;
  }

  return readNumber(first.actual) ?? null;
}

async function collectCypressCoverage(
  cypressCoverageTempDir: string | undefined,
  runner: CommandRunner,
): Promise<
  { averageCoverage: number; breakdown: E2eCoverageBreakdown } | undefined
> {
  if (!cypressCoverageTempDir) {
    return undefined;
  }

  const exists = await pathExists(cypressCoverageTempDir);
  if (!exists) {
    core.info(
      `${cypressCoverageTempDir} not found. Skipping Cypress coverage collection.`,
    );
    return undefined;
  }

  const result = await runner(
    "npx",
    [
      "nyc",
      "report",
      "--reporter=text-summary",
      "--temp-dir",
      cypressCoverageTempDir,
    ],
    process.env,
  );

  if (result.exitCode !== 0) {
    throw new ActionError(
      "COLLECTION_COMMAND_FAILED",
      "collect_cypress",
      `Failed to execute Cypress coverage collection: ${result.stderr || result.stdout}`,
    );
  }

  const statements = parseCoverageMetric(result.stdout, "Statements");
  const branches = parseCoverageMetric(result.stdout, "Branches");
  const functions = parseCoverageMetric(result.stdout, "Functions");
  const lines = parseCoverageMetric(result.stdout, "Lines");

  if (
    [statements, branches, functions, lines].every(
      (value) => value === undefined,
    )
  ) {
    throw new ActionError(
      "COLLECTION_INVALID_COVERAGE",
      "collect_cypress",
      "Coverage summary returned 'Unknown' for all Cypress metrics.",
    );
  }

  const normalizedStatements = metricToNumber(statements, "Statements");
  const normalizedBranches = metricToNumber(branches, "Branches");
  const normalizedFunctions = metricToNumber(functions, "Functions");
  const normalizedLines = metricToNumber(lines, "Lines");
  const averageCoverage = calculateAverageCoverage([
    normalizedLines,
    normalizedStatements,
    normalizedFunctions,
    normalizedBranches,
  ]);

  return {
    averageCoverage,
    breakdown: {
      e2e_test_coverage_statements: normalizedStatements,
      e2e_test_coverage_branches: normalizedBranches,
      e2e_test_coverage_functions: normalizedFunctions,
      e2e_test_coverage_lines: normalizedLines,
    },
  };
}

function resolveRepoName(packageJsonText: string): string {
  const parsed = parseJsonRecord(packageJsonText);
  const packageName =
    typeof parsed.name === "string" && parsed.name.trim()
      ? parsed.name
      : undefined;

  if (!packageName) {
    throw new ActionError(
      "COLLECTION_INVALID_INPUT",
      "validate_inputs",
      "package.json must define a name field.",
    );
  }

  return packageName;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseCoverageMetric(
  output: string,
  metricName: string,
): number | undefined {
  const regex = new RegExp(
    `^${metricName}\\s*:\\s*([0-9.]+|Unknown)(?=%)`,
    "im",
  );
  const match = output.match(regex);
  const rawValue = match?.[1];
  if (!rawValue || rawValue === "Unknown") {
    return undefined;
  }

  const parsed = Number.parseFloat(rawValue);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function metricToNumber(value: number | undefined, label: string): number {
  if (value === undefined) {
    core.warning(`${label} coverage is unavailable; defaulting to 0.`);
    return 0;
  }

  return value;
}

async function defaultCommandRunner(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  const result = await exec.getExecOutput(command, args, {
    env: normalizeEnv(env),
    ignoreReturnCode: true,
    silent: true,
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function normalizeEnv(
  env: NodeJS.ProcessEnv | undefined,
): Record<string, string> | undefined {
  if (!env) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function parseJsonRecord(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  return readObject(parsed);
}

function parseJsonArray(text: string): Array<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(text);
  return Array.isArray(parsed) ? parsed.map(readObject) : [];
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readPct(metric: unknown): number {
  const record = readObject(metric);
  return readNumber(record.pct) ?? 0;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}
