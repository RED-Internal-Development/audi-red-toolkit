import { describe, expect, test } from "vitest";

import { parseMsiSyncInputsFromRecord } from "../../actions/msi-sync/src/inputs.js";

const baseInputs = {
  from: "docs/backend_services_v2/my-service",
  parentPageId: "12345",
  deploymentConfig: "deployment-config.json",
  baseUrl: "https://collaboration.msi.audi.com/confluence",
  spaceKey: "AAA",
  token: "masked-token",
  diagrams_source: "diagrams",
};

describe("msi-sync input parsing", () => {
  test("normalizes valid inputs and keeps diagrams_source optional", () => {
    expect(parseMsiSyncInputsFromRecord(baseInputs)).toEqual({
      from: "docs/backend_services_v2/my-service",
      parentPageId: "12345",
      deploymentConfig: "deployment-config.json",
      baseUrl: "https://collaboration.msi.audi.com/confluence",
      spaceKey: "AAA",
      token: "masked-token",
      diagramsSource: "diagrams",
    });

    expect(
      parseMsiSyncInputsFromRecord({
        ...baseInputs,
        diagrams_source: undefined,
      }),
    ).toMatchObject({
      diagramsSource: undefined,
    });
  });

  test("rejects missing required inputs", () => {
    expect(() =>
      parseMsiSyncInputsFromRecord({
        ...baseInputs,
        from: "",
      }),
    ).toThrow("MSI_INVALID_INPUT");
  });
});
