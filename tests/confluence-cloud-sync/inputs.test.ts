import { describe, expect, test } from "vitest";

import { parseConfluenceCloudSyncInputsFromRecord } from "../../actions/confluence-cloud-sync/src/inputs.js";

const baseInputs = {
  from: "docs/feature_apps_v2/my-app",
  parentPageId: "2160066751",
  deploymentConfig: "deployment-config.json",
  baseUrl: "https://yourorg.atlassian.net/",
  spaceKey: "APPT",
  username: "user@example.com",
  token: "masked-api-token",
  diagrams_source: "diagrams",
};

describe("confluence-cloud-sync input parsing", () => {
  test("normalizes valid inputs and keeps diagrams_source optional", () => {
    expect(parseConfluenceCloudSyncInputsFromRecord(baseInputs)).toEqual({
      from: "docs/feature_apps_v2/my-app",
      parentPageId: "2160066751",
      deploymentConfig: "deployment-config.json",
      baseUrl: "https://yourorg.atlassian.net/",
      spaceKey: "APPT",
      username: "user@example.com",
      token: "masked-api-token",
      diagramsSource: "diagrams",
    });

    expect(
      parseConfluenceCloudSyncInputsFromRecord({
        ...baseInputs,
        diagrams_source: undefined,
      }),
    ).toMatchObject({
      diagramsSource: undefined,
    });
  });

  test("rejects missing required inputs", () => {
    expect(() =>
      parseConfluenceCloudSyncInputsFromRecord({
        ...baseInputs,
        from: "",
      }),
    ).toThrow("CLOUD_SYNC_INVALID_INPUT");
  });

  test("rejects missing username", () => {
    expect(() =>
      parseConfluenceCloudSyncInputsFromRecord({
        ...baseInputs,
        username: "",
      }),
    ).toThrow("CLOUD_SYNC_INVALID_INPUT");
  });

  test("rejects missing token", () => {
    expect(() =>
      parseConfluenceCloudSyncInputsFromRecord({
        ...baseInputs,
        token: "",
      }),
    ).toThrow("CLOUD_SYNC_INVALID_INPUT");
  });
});
