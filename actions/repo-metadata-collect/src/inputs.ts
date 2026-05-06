import * as core from "@actions/core";

import { ActionError } from "../../../packages/action-common/src/errors.js";

export interface MetadataSyncInputs {
  githubToken: string;
  workflowRunId: string;
  repository: string;
}

type InputRecord = Record<string, string | undefined>;

export function readRepoMetadataCollectInputs(): MetadataSyncInputs {
  const parsed = parseRepoMetadataCollectInputsFromRecord({
    github_token: core.getInput("github_token"),
    workflow_run_id: core.getInput("workflow_run_id"),
    repository: core.getInput("repository"),
  });

  core.setSecret(parsed.githubToken);
  return parsed;
}

export function parseRepoMetadataCollectInputsFromRecord(
  inputs: InputRecord,
): MetadataSyncInputs {
  const githubToken = requireInput(inputs, "github_token");
  const workflowRunId = requireInput(inputs, "workflow_run_id");
  const repository = requireInput(inputs, "repository");

  if (!repository.includes("/")) {
    throw new ActionError(
      "METADATA_INVALID_INPUT",
      "validate_inputs",
      "repository must be in owner/name form.",
    );
  }

  return {
    githubToken,
    workflowRunId,
    repository,
  };
}

function requireInput(inputs: InputRecord, name: string): string {
  const value = inputs[name]?.trim();
  if (!value) {
    throw new ActionError(
      "METADATA_INVALID_INPUT",
      "validate_inputs",
      `${name} is required.`,
    );
  }

  return value;
}
