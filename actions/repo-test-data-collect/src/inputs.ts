import * as core from "@actions/core";

import { ActionError } from "../../../packages/action-common/src/errors.js";

export interface CollectionSyncInputs {
  githubToken: string;
  jestCoverageFilePath: string;
  lighthouseCoverageFilePath: string;
  cypressCoverageTempDir: string | undefined;
}

type InputRecord = Record<string, string | undefined>;

export function readRepoTestDataCollectInputs(): CollectionSyncInputs {
  const parsed = parseRepoTestDataCollectInputsFromRecord({
    github_token: core.getInput("github_token"),
    jest_coverage_file_path: core.getInput("jest_coverage_file_path"),
    lighthouse_coverage_file_path: core.getInput(
      "lighthouse_coverage_file_path",
    ),
    cypress_coverage_temp_dir: core.getInput("cypress_coverage_temp_dir"),
  });

  core.setSecret(parsed.githubToken);
  return parsed;
}

export function parseRepoTestDataCollectInputsFromRecord(
  inputs: InputRecord,
): CollectionSyncInputs {
  const githubToken = requireInput(inputs, "github_token");
  const jestCoverageFilePath =
    optionalInput(inputs, "jest_coverage_file_path") ??
    "coverage/coverage-summary.json";
  const lighthouseCoverageFilePath =
    optionalInput(inputs, "lighthouse_coverage_file_path") ??
    ".lighthouseci/assertion-results.json";
  const cypressCoverageTempDir = optionalInput(
    inputs,
    "cypress_coverage_temp_dir",
  );

  if (
    !jestCoverageFilePath &&
    !lighthouseCoverageFilePath &&
    !cypressCoverageTempDir
  ) {
    throw new ActionError(
      "COLLECTION_INVALID_INPUT",
      "validate_inputs",
      "At least one coverage input must be provided.",
    );
  }

  return {
    githubToken,
    jestCoverageFilePath,
    lighthouseCoverageFilePath,
    cypressCoverageTempDir,
  };
}

function requireInput(inputs: InputRecord, name: string): string {
  const value = optionalInput(inputs, name);
  if (!value) {
    throw new ActionError(
      "COLLECTION_INVALID_INPUT",
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
