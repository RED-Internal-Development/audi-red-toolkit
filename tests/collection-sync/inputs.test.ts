import { describe, expect, test } from "vitest";

import { parseCollectionSyncInputsFromRecord } from "../../actions/collection-sync/src/inputs.js";

describe("collection-sync input parsing", () => {
  test("normalizes valid inputs", () => {
    expect(
      parseCollectionSyncInputsFromRecord({
        github_token: "token",
        jest_coverage_file_path: "coverage/coverage-summary.json",
        lighthouse_coverage_file_path: ".lighthouseci/assertion-results.json",
        cypress_coverage_temp_dir: ".nyc_output",
      }),
    ).toEqual({
      githubToken: "token",
      jestCoverageFilePath: "coverage/coverage-summary.json",
      lighthouseCoverageFilePath: ".lighthouseci/assertion-results.json",
      cypressCoverageTempDir: ".nyc_output",
    });
  });

  test("requires github token", () => {
    expect(() =>
      parseCollectionSyncInputsFromRecord({
        github_token: "",
        jest_coverage_file_path: "coverage/coverage-summary.json",
      }),
    ).toThrow("COLLECTION_INVALID_INPUT");
  });
});
