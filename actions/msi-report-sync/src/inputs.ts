import * as core from "@actions/core";

import { ActionError } from "../../../packages/action-common/src/errors.js";

export interface MsiReportSyncInputs {
  dataFile: string;
  pageTitle: string | undefined;
  parentPageId: string | undefined;
  targetPageId: string | undefined;
  baseUrl: string;
  spaceKey: string;
  token: string;
  csvFile: string | undefined;
}

type InputRecord = Record<string, string | undefined>;

export function readMsiReportSyncInputs(): MsiReportSyncInputs {
  const token = core.getInput("token");
  if (token) {
    core.setSecret(token);
  }

  return parseMsiReportSyncInputsFromRecord({
    dataFile: core.getInput("dataFile"),
    pageTitle: core.getInput("pageTitle"),
    parentPageId: core.getInput("parentPageId"),
    targetPageId: core.getInput("targetPageId"),
    baseUrl: core.getInput("baseUrl"),
    spaceKey: core.getInput("spaceKey"),
    token,
    csvFile: core.getInput("csvFile"),
  });
}

export function parseMsiReportSyncInputsFromRecord(
  inputs: InputRecord,
): MsiReportSyncInputs {
  const pageTitle = optionalInput(inputs, "pageTitle");
  const parentPageId = optionalInput(inputs, "parentPageId");
  const targetPageId = optionalInput(inputs, "targetPageId");

  if (!targetPageId && !pageTitle) {
    throw new ActionError(
      "MSI_INVALID_INPUT",
      "validate_inputs",
      "Either targetPageId or pageTitle must be provided.",
    );
  }

  if (!targetPageId && !parentPageId) {
    throw new ActionError(
      "MSI_INVALID_INPUT",
      "validate_inputs",
      "parentPageId is required when targetPageId is not provided.",
    );
  }

  return {
    dataFile: requireInput(inputs, "dataFile"),
    pageTitle,
    parentPageId,
    targetPageId,
    baseUrl: requireInput(inputs, "baseUrl"),
    spaceKey: requireInput(inputs, "spaceKey"),
    token: requireInput(inputs, "token"),
    csvFile: optionalInput(inputs, "csvFile"),
  };
}

function requireInput(inputs: InputRecord, name: string): string {
  const value = optionalInput(inputs, name);
  if (!value) {
    throw new ActionError(
      "MSI_INVALID_INPUT",
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
