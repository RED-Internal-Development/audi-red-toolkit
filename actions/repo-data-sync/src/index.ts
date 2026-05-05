import * as core from "@actions/core";

import { isActionError } from "../../../packages/action-common/src/errors.js";
import { readRepoDataSyncInputs } from "./inputs.js";
import { executeRepoDataSync } from "./sync.js";

export async function run(): Promise<void> {
  const inputs = readRepoDataSyncInputs();
  const result = await executeRepoDataSync(inputs);

  core.setOutput("report_file", result.reportFile);
  core.setOutput("per_repo_file", result.perRepoFile);
  core.setOutput("profile_dashboard_file", result.profileDashboardFile);
  core.setOutput("repo_name", result.repoName);
  core.notice(`Report sync wrote ${result.reportFile}.`);
}

function handleRunFailure(error: unknown): void {
  if (isActionError(error)) {
    core.setFailed(error.message);
    return;
  }

  core.setFailed(error instanceof Error ? error.message : String(error));
}

if (process.env.VITEST !== "true") {
  run().catch(handleRunFailure);
}
