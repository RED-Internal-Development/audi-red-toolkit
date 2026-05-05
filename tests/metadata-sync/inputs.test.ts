import { describe, expect, test } from "vitest";

import { parseMetadataSyncInputsFromRecord } from "../../actions/metadata-sync/src/inputs.js";

describe("metadata-sync input parsing", () => {
  test("normalizes valid metadata-sync inputs", () => {
    expect(
      parseMetadataSyncInputsFromRecord({
        github_token: "token",
        workflow_run_id: "1234",
        repository: "RED-Internal-Development/example-repo",
      }),
    ).toEqual({
      githubToken: "token",
      workflowRunId: "1234",
      repository: "RED-Internal-Development/example-repo",
    });
  });

  test("requires owner/name repository format", () => {
    expect(() =>
      parseMetadataSyncInputsFromRecord({
        github_token: "token",
        workflow_run_id: "1234",
        repository: "example-repo",
      }),
    ).toThrow("METADATA_INVALID_INPUT");
  });

  test("requires github_token", () => {
    expect(() =>
      parseMetadataSyncInputsFromRecord({
        github_token: "",
        workflow_run_id: "1234",
        repository: "RED-Internal-Development/example-repo",
      }),
    ).toThrow("METADATA_INVALID_INPUT");
  });
});
