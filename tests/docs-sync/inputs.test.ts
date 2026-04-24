import { describe, expect, test } from "vitest";

import { parseDocsSyncInputsFromRecord } from "../../actions/docs-sync/src/inputs.js";

const baseInputs = {
  source_file: "docs/",
  destination_repo: "RED-Internal-Development/audi-red-documentation",
  destination_folder: "docs/feature_apps",
  user_email: "redsys1@audired.ca",
  user_name: "audired",
  user_actor: "octocat",
  destination_branch: "docs-sync/feature-apps",
  git_server: "github.com",
  use_rsync: "true",
};

describe("docs-sync input parsing", () => {
  test("normalizes valid docs-sync inputs", () => {
    expect(parseDocsSyncInputsFromRecord(baseInputs, "token")).toEqual({
      sourceFile: "docs/",
      destinationRepo: "RED-Internal-Development/audi-red-documentation",
      destinationFolder: "docs/feature_apps",
      userEmail: "redsys1@audired.ca",
      userName: "audired",
      userActor: "octocat",
      destinationBranch: "docs-sync/feature-apps",
      commitMessage: undefined,
      rename: undefined,
      useRsync: true,
      gitServer: "github.com",
      githubToken: "token",
    });
  });

  test("defaults optional values consistently", () => {
    const {
      destination_folder: _folder,
      use_rsync: _rsync,
      git_server: _server,
      destination_branch: _branch,
      ...minimal
    } = baseInputs;

    expect(parseDocsSyncInputsFromRecord(minimal, "token")).toMatchObject({
      destinationFolder: "",
      destinationBranch: "main",
      useRsync: false,
      gitServer: "github.com",
    });
  });

  test("treats explicit false use_rsync as disabled", () => {
    expect(
      parseDocsSyncInputsFromRecord(
        { ...baseInputs, use_rsync: "false" },
        "token",
      ),
    ).toMatchObject({
      useRsync: false,
    });
  });

  test("rejects invalid use_rsync values", () => {
    expect(() =>
      parseDocsSyncInputsFromRecord(
        { ...baseInputs, use_rsync: "sometimes" },
        "token",
      ),
    ).toThrow("DOCSYNC_INVALID_INPUT");
  });

  test("requires the GitHub token secret", () => {
    expect(() => parseDocsSyncInputsFromRecord(baseInputs, "")).toThrow(
      "DOCSYNC_MISSING_SECRET",
    );
  });
});
