import * as core from "@actions/core";

import { ActionError } from "../../../packages/action-common/src/errors.js";

export interface DocsSyncInputs {
  sourceFile: string;
  destinationRepo: string;
  destinationFolder: string;
  userEmail: string;
  userName: string;
  userActor: string;
  destinationBranch: string;
  destinationBranchExists?: boolean;
  commitMessage: string | undefined;
  rename: string | undefined;
  useRsync: boolean;
  gitServer: string;
  githubToken: string;
}

type InputRecord = Record<string, string | undefined>;

export function readDocsSyncInputs(): DocsSyncInputs {
  const token = process.env.API_TOKEN_GITHUB ?? "";
  if (token) {
    core.setSecret(token);
  }

  return parseDocsSyncInputsFromRecord(
    {
      source_file: core.getInput("source_file"),
      destination_repo: core.getInput("destination_repo"),
      destination_folder: core.getInput("destination_folder"),
      user_email: core.getInput("user_email"),
      user_name: core.getInput("user_name"),
      user_actor: core.getInput("user_actor"),
      destination_branch: core.getInput("destination_branch"),
      destination_branch_exists: core.getInput("destination_branch_exists"),
      commit_message: core.getInput("commit_message"),
      rename: core.getInput("rename"),
      use_rsync: core.getInput("use_rsync"),
      git_server: core.getInput("git_server")
    },
    token
  );
}

export function parseDocsSyncInputsFromRecord(inputs: InputRecord, githubToken: string): DocsSyncInputs {
  const sourceFile = requireInput(inputs, "source_file");
  const destinationRepo = requireInput(inputs, "destination_repo");
  const userEmail = requireInput(inputs, "user_email");
  const userName = requireInput(inputs, "user_name");
  const userActor = requireInput(inputs, "user_actor");
  const destinationBranch = optionalInput(inputs, "destination_branch") ?? "main";

  if (!githubToken.trim()) {
    throw new ActionError("DOCSYNC_MISSING_SECRET", "validate_inputs", "API_TOKEN_GITHUB is required.");
  }

  return {
    sourceFile,
    destinationRepo,
    destinationFolder: optionalInput(inputs, "destination_folder") ?? "",
    userEmail,
    userName,
    userActor,
    destinationBranch,
    destinationBranchExists: parseOptionalBooleanInput(inputs.destination_branch_exists, "destination_branch_exists"),
    commitMessage: optionalInput(inputs, "commit_message"),
    rename: optionalInput(inputs, "rename"),
    useRsync: parseBooleanInput(inputs.use_rsync, "use_rsync", false),
    gitServer: optionalInput(inputs, "git_server") ?? "github.com",
    githubToken
  };
}

function requireInput(inputs: InputRecord, name: string): string {
  const value = optionalInput(inputs, name);
  if (!value) {
    throw new ActionError("DOCSYNC_INVALID_INPUT", "validate_inputs", `${name} is required.`);
  }
  return value;
}

function optionalInput(inputs: InputRecord, name: string): string | undefined {
  const value = inputs[name]?.trim();
  return value ? value : undefined;
}

function parseBooleanInput(value: string | undefined, name: string, defaultValue: boolean): boolean {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return defaultValue;
  }

  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  throw new ActionError("DOCSYNC_INVALID_INPUT", "validate_inputs", `${name} must be 'true' or 'false'.`);
}

function parseOptionalBooleanInput(value: string | undefined, name: string): boolean | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  return parseBooleanInput(value, name, false);
}
