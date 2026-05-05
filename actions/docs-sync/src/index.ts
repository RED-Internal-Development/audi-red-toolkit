import * as core from "@actions/core";
import { stat } from "node:fs/promises";

import {
  ActionError,
  isActionError,
} from "../../../packages/action-common/src/errors.js";
import { validatePath } from "../../../packages/docs-validation/src/confluence-validation.js";
import { syncDocs } from "./git-sync.js";
import { readDocsSyncInputs } from "./inputs.js";

export async function run(): Promise<void> {
  const inputs = readDocsSyncInputs();
  await ensureSourceExists(inputs.sourceFile);

  const validationIssues = await validatePath(inputs.sourceFile);
  if (validationIssues.length > 0) {
    for (const issue of validationIssues) {
      core.error(`${issue.filePath} | ${issue.ruleId} | ${issue.message}`);
    }
    throw new ActionError(
      "DOCSYNC_INVALID_CONTENT",
      "validate_docs",
      "Source content contains Confluence-incompatible markdown/MDX. Fix the reported files upstream before docs-sync can copy them.",
    );
  }

  core.info(
    `Resolved docs sync target: repo=${inputs.destinationRepo} branch=${inputs.destinationBranch} folder=${inputs.destinationFolder || "."}`,
  );

  const pushed = await syncDocs(inputs);
  if (pushed) {
    core.notice("Documentation changes pushed to the destination repository.");
  } else {
    core.notice("No documentation changes detected.");
  }
}

async function ensureSourceExists(sourceFile: string): Promise<void> {
  const sourceStat = await stat(sourceFile).catch(() => undefined);
  if (!sourceStat) {
    throw new ActionError(
      "DOCSYNC_INVALID_INPUT",
      "validate_inputs",
      `source_file '${sourceFile}' does not exist.`,
    );
  }
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
