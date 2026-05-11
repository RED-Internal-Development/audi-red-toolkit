import { describe, expect, test } from "vitest";

import { parseRepoMetadataCollectInputsFromRecord } from "../../actions/repo-metadata-collect/src/inputs.js";

describe("repo-metadata-collect input parsing", () => {
  test("normalizes valid repo-metadata-collect inputs", () => {
    expect(
      parseRepoMetadataCollectInputsFromRecord({
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

  test("allows workflow_run_id to be omitted for manual dispatches", () => {
    expect(
      parseRepoMetadataCollectInputsFromRecord({
        github_token: "token",
        repository: "RED-Internal-Development/example-repo",
      }),
    ).toEqual({
      githubToken: "token",
      workflowRunId: undefined,
      repository: "RED-Internal-Development/example-repo",
    });
  });

  test("requires owner/name repository format", () => {
    expect(() =>
      parseRepoMetadataCollectInputsFromRecord({
        github_token: "token",
        workflow_run_id: "1234",
        repository: "example-repo",
      }),
    ).toThrow("METADATA_INVALID_INPUT");
  });

  test("requires github_token", () => {
    expect(() =>
      parseRepoMetadataCollectInputsFromRecord({
        github_token: "",
        workflow_run_id: "1234",
        repository: "RED-Internal-Development/example-repo",
      }),
    ).toThrow("METADATA_INVALID_INPUT");
  });
});
