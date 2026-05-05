import * as core from "@actions/core";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ActionError } from "../../../packages/action-common/src/errors.js";
import type { ReportSyncInputs } from "./inputs.js";

type JsonRecord = Record<string, unknown>;

interface SyncRuntimeOptions {
  now?: () => Date;
}

export async function executeReportSync(
  inputs: ReportSyncInputs,
  options: SyncRuntimeOptions = {},
): Promise<{ reportFile: string; perRepoFile: string; repoName: string }> {
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

  return { reportFile, perRepoFile, repoName };
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
