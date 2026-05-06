import * as core from "@actions/core";

import { ActionError } from "../../../packages/action-common/src/errors.js";

export interface MsiSyncInputs {
  from: string;
  parentPageId: string;
  deploymentConfig: string | undefined;
  baseUrl: string;
  spaceKey: string;
  token: string;
  diagramsSource: string | undefined;
}

type InputRecord = Record<string, string | undefined>;

export function readMsiSyncInputs(): MsiSyncInputs {
  const token = core.getInput("token");
  if (token) {
    core.setSecret(token);
  }

  return parseMsiSyncInputsFromRecord({
    from: core.getInput("from"),
    parentPageId: core.getInput("parentPageId"),
    deploymentConfig: core.getInput("deploymentConfig"),
    baseUrl: core.getInput("baseUrl"),
    spaceKey: core.getInput("spaceKey"),
    token,
    diagrams_source: core.getInput("diagrams_source"),
  });
}

export function parseMsiSyncInputsFromRecord(inputs: InputRecord): MsiSyncInputs {
  return {
    from: requireInput(inputs, "from"),
    parentPageId: requireInput(inputs, "parentPageId"),
    deploymentConfig: optionalInput(inputs, "deploymentConfig"),
    baseUrl: requireInput(inputs, "baseUrl"),
    spaceKey: requireInput(inputs, "spaceKey"),
    token: requireInput(inputs, "token"),
    diagramsSource: optionalInput(inputs, "diagrams_source"),
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
