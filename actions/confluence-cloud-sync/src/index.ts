import * as core from "@actions/core";
import { stat } from "node:fs/promises";

import {
  ActionError,
  isActionError,
} from "../../../packages/action-common/src/errors.js";
import { validatePath } from "../../../packages/docs-validation/src/confluence-validation.js";
import { buildPublishPlan } from "../../msi-sync/src/plan.js";
import { PublishStats } from "../../msi-sync/src/summary.js";
import { readConfluenceCloudSyncInputs } from "./inputs.js";
import { executeConfluenceCloudSync } from "./sync.js";

export async function run(): Promise<void> {
  const inputs = readConfluenceCloudSyncInputs();
  await ensureSourceDirectory(inputs.from);

  core.info(
    `Preparing Confluence Cloud sync from ${inputs.from} into space ${inputs.spaceKey} under parent page ${inputs.parentPageId}.`,
  );

  const validationIssues = await validatePath(inputs.from);
  if (validationIssues.length > 0) {
    for (const issue of validationIssues) {
      core.error(`${issue.filePath} | ${issue.ruleId} | ${issue.message}`);
    }

    throw new ActionError(
      "CLOUD_SYNC_INVALID_CONTENT",
      "validate_docs",
      "Source content contains Confluence-incompatible markdown/MDX. Fix the reported files upstream before Confluence Cloud sync can publish them.",
    );
  }

  const publishPlan = await buildPublishPlan({
    sourceRoot: inputs.from,
    parentPageId: inputs.parentPageId,
    deploymentConfigPath: inputs.deploymentConfig,
  });
  const stats = new PublishStats();

  for (const warning of publishPlan.warnings) {
    core.warning(warning);
  }

  core.info(
    `Discovered ${publishPlan.entries.filter((entry) => entry.sourceFilePath).length} markdown file(s) across ${publishPlan.roots.length} publish root(s) for Confluence Cloud sync.`,
  );

  if (
    publishPlan.entries.filter((entry) => entry.sourceFilePath).length === 0
  ) {
    core.notice("No markdown files found for Confluence Cloud sync.");
    return;
  }

  await executeConfluenceCloudSync(inputs, publishPlan, stats);

  if (stats.hasFailures()) {
    throw new ActionError(
      "CLOUD_SYNC_PARTIAL_PUBLISH_FAILURE",
      "publish",
      stats.renderSummary(),
    );
  }

  core.notice("Confluence Cloud sync publish completed successfully.");
}

async function ensureSourceDirectory(directory: string): Promise<void> {
  const sourceStat = await stat(directory).catch(() => undefined);

  if (!sourceStat?.isDirectory()) {
    throw new ActionError(
      "CLOUD_SYNC_INVALID_INPUT",
      "validate_inputs",
      "'from' must reference an existing directory.",
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
