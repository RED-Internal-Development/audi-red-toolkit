import { describe, expect, test } from "vitest";

import { parseRepoTestDataCollectInputsFromRecord } from "../../actions/repo-test-data-collect/src/inputs.js";

describe("repo-test-data-collect input parsing", () => {
  test("normalizes valid inputs", () => {
    expect(
      parseRepoTestDataCollectInputsFromRecord({
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
      parseRepoTestDataCollectInputsFromRecord({
        github_token: "",
        jest_coverage_file_path: "coverage/coverage-summary.json",
      }),
    ).toThrow("COLLECTION_INVALID_INPUT");
  });
});
