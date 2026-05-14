import * as core from "@actions/core";

import { ActionError } from "../../../packages/action-common/src/errors.js";

export interface ConfluenceCloudSyncInputs {
  from: string;
  parentPageId: string;
  deploymentConfig: string | undefined;
  baseUrl: string;
  spaceKey: string;
  username: string;
  token: string;
  diagramsSource: string | undefined;
}

type InputRecord = Record<string, string | undefined>;

export function readConfluenceCloudSyncInputs(): ConfluenceCloudSyncInputs {
  const token = core.getInput("token");
  if (token) {
    core.setSecret(token);
  }

  return parseConfluenceCloudSyncInputsFromRecord({
    from: core.getInput("from"),
    parentPageId: core.getInput("parentPageId"),
    deploymentConfig: core.getInput("deploymentConfig"),
    baseUrl: core.getInput("baseUrl"),
    spaceKey: core.getInput("spaceKey"),
    username: core.getInput("username"),
    token,
    diagrams_source: core.getInput("diagrams_source"),
  });
}

export function parseConfluenceCloudSyncInputsFromRecord(
  inputs: InputRecord,
): ConfluenceCloudSyncInputs {
  return {
    from: requireInput(inputs, "from"),
    parentPageId: requireInput(inputs, "parentPageId"),
    deploymentConfig: optionalInput(inputs, "deploymentConfig"),
    baseUrl: requireInput(inputs, "baseUrl"),
    spaceKey: requireInput(inputs, "spaceKey"),
    username: requireInput(inputs, "username"),
    token: requireInput(inputs, "token"),
    diagramsSource: optionalInput(inputs, "diagrams_source"),
  };
}

function requireInput(inputs: InputRecord, name: string): string {
  const value = optionalInput(inputs, name);
  if (!value) {
    throw new ActionError(
      "CLOUD_SYNC_INVALID_INPUT",
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
