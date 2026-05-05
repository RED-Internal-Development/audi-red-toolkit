import * as core from "@actions/core";

import { ActionError } from "../../../packages/action-common/src/errors.js";

export interface ReportSyncInputs {
  metadataFile: string;
  collectionReportFile: string | undefined;
  cypressReportFile: string | undefined;
  jestReportFile: string | undefined;
  dataDir: string;
  collectionOutputDir: string;
  docsDestinationTeamFolder: string;
  docsDestinationAppFolder: string;
  docsBranch: string;
  prodSupportEnabled: boolean;
}

type InputRecord = Record<string, string | undefined>;

export function readReportSyncInputs(): ReportSyncInputs {
  return parseReportSyncInputsFromRecord({
    metadata_file: core.getInput("metadata_file"),
    collection_report_file: core.getInput("collection_report_file"),
    cypress_report_file: core.getInput("cypress_report_file"),
    jest_report_file: core.getInput("jest_report_file"),
    data_dir: core.getInput("data_dir"),
    collection_output_dir: core.getInput("collection_output_dir"),
    docs_destination_team_folder: core.getInput("docs_destination_team_folder"),
    docs_destination_app_folder: core.getInput("docs_destination_app_folder"),
    docs_branch: core.getInput("docs_branch"),
    prod_support_enabled: core.getInput("prod_support_enabled"),
  });
}

export function parseReportSyncInputsFromRecord(
  inputs: InputRecord,
): ReportSyncInputs {
  return {
    metadataFile: requireInput(inputs, "metadata_file"),
    collectionReportFile: optionalInput(inputs, "collection_report_file"),
    cypressReportFile: optionalInput(inputs, "cypress_report_file"),
    jestReportFile: optionalInput(inputs, "jest_report_file"),
    dataDir: optionalInput(inputs, "data_dir") ?? "data",
    collectionOutputDir:
      optionalInput(inputs, "collection_output_dir") ?? "collection-report",
    docsDestinationTeamFolder: requireInput(
      inputs,
      "docs_destination_team_folder",
    ),
    docsDestinationAppFolder: requireInput(
      inputs,
      "docs_destination_app_folder",
    ),
    docsBranch: requireInput(inputs, "docs_branch"),
    prodSupportEnabled: parseBoolean(
      optionalInput(inputs, "prod_support_enabled") ?? "false",
      "prod_support_enabled",
    ),
  };
}

function requireInput(inputs: InputRecord, name: string): string {
  const value = optionalInput(inputs, name);
  if (!value) {
    throw new ActionError(
      "REPORT_SYNC_INVALID_INPUT",
      "validate_inputs",
      `${name} is required.`,
    );
  }

  return value;
}

function optionalInput(inputs: InputRecord, name: string): string | undefined {
  const value = inputs[name]?.trim();
  return value ? value : undefined;
}

function parseBoolean(value: string, name: string): boolean {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new ActionError(
    "REPORT_SYNC_INVALID_INPUT",
    "validate_inputs",
    `${name} must be 'true' or 'false'.`,
  );
}
