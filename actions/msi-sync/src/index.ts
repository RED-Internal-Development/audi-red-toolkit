import * as core from "@actions/core";
import { stat } from "node:fs/promises";

import {
  ActionError,
  isActionError,
} from "../../../packages/action-common/src/errors.js";
import { validatePath } from "../../../packages/docs-validation/src/confluence-validation.js";
import { discoverPublishTree } from "./discovery.js";
import { readMsiSyncInputs } from "./inputs.js";
import { PublishStats } from "./summary.js";

export async function run(): Promise<void> {
  const inputs = readMsiSyncInputs();
  await ensureSourceDirectory(inputs.from);

  core.info(
    `Preparing MSI sync from ${inputs.from} into space ${inputs.spaceKey} under parent page ${inputs.parentPageId}.`,
  );

  const validationIssues = await validatePath(inputs.from);
  if (validationIssues.length > 0) {
    for (const issue of validationIssues) {
      core.error(`${issue.filePath} | ${issue.ruleId} | ${issue.message}`);
    }

    throw new ActionError(
      "MSI_INVALID_CONTENT",
      "validate_docs",
      "Source content contains Confluence-incompatible markdown/MDX. Fix the reported files upstream before MSI sync can publish them.",
    );
  }

  const publishTree = await discoverPublishTree(inputs.from);
  const stats = new PublishStats();

  core.info(
    `Discovered ${publishTree.files.length} markdown file(s) and ${publishTree.collisions.length} collision candidate(s) for MSI sync.`,
  );

  if (publishTree.files.length === 0) {
    core.notice("No markdown files found for MSI sync.");
    return;
  }

  core.notice(
    "MSI sync validation and discovery completed. Publish orchestration is not enabled in this integration pass.",
  );

  if (stats.hasFailures()) {
    throw new ActionError(
      "MSI_PARTIAL_PUBLISH_FAILURE",
      "publish",
      stats.renderSummary(),
    );
  }
}

async function ensureSourceDirectory(directory: string): Promise<void> {
  const sourceStat = await stat(directory).catch(() => undefined);

  if (!sourceStat?.isDirectory()) {
    throw new ActionError(
      "MSI_INVALID_INPUT",
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
