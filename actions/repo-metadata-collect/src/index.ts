import * as core from "@actions/core";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ActionError,
  isActionError,
} from "../../../packages/action-common/src/errors.js";
import { collectMetadataReport } from "./collect.js";
import { readRepoMetadataCollectInputs } from "./inputs.js";

export async function run(): Promise<void> {
  const inputs = readRepoMetadataCollectInputs();

  core.info(`Collecting repository metadata for ${inputs.repository}.`);

  const report = await collectMetadataReport(inputs);
  const reportFile = resolve("metadata-report.json");
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  core.setOutput("report_file", reportFile);
  core.notice(`Metadata report written to ${reportFile}.`);
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
