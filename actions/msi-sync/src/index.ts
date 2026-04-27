import * as core from "@actions/core";

import { isActionError } from "../../../packages/action-common/src/errors.js";
import { readMsiSyncInputs } from "./inputs.js";

export async function run(): Promise<void> {
  const inputs = readMsiSyncInputs();
  core.info(`Preparing MSI sync from ${inputs.from} into space ${inputs.spaceKey}.`);
  core.notice("MSI sync action scaffold loaded.");
}

run().catch((error: unknown) => {
  if (isActionError(error)) {
    core.setFailed(error.message);
    return;
  }

  core.setFailed(error instanceof Error ? error.message : String(error));
});
