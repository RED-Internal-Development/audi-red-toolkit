import { describe, expect, test } from "vitest";

import { buildClonePlan } from "../../actions/docs-sync/src/git-sync.js";
import type { DocsSyncInputs } from "../../actions/docs-sync/src/inputs.js";

const baseInputs: DocsSyncInputs = {
  sourceFile: "docs/",
  destinationRepo: "RED-Internal-Development/audi-red-documentation",
  destinationFolder: "docs/feature_apps",
  userEmail: "redsys1@audired.ca",
  userName: "audired",
  userActor: "octocat",
  destinationBranch: "docs-sync/feature-apps",
  destinationBranchExists: true,
  commitMessage: undefined,
  rename: "app-name",
  useRsync: true,
  gitServer: "github.com",
  githubToken: "token"
};

describe("docs-sync git planning", () => {
  test("uses a shallow clone for existing destination branches", () => {
    const plan = buildClonePlan(baseInputs, "/tmp/docs-sync-target", true);

    expect(plan).toMatchObject({
      branchExists: true,
      cloneArgs: [
      "clone",
      "--depth",
      "1",
      "--single-branch",
      "--branch",
      "docs-sync/feature-apps",
      "https://x-access-token:token@github.com/RED-Internal-Development/audi-red-documentation.git",
      "/tmp/docs-sync-target"
      ]
    });
    expect(plan.checkoutArgs).toBeUndefined();
  });

  test("uses a shallow main clone before creating a new destination branch", () => {
    const plan = buildClonePlan({ ...baseInputs, destinationBranchExists: false }, "/tmp/docs-sync-target", false);

    expect(plan).toMatchObject({
      branchExists: false,
      cloneArgs: [
      "clone",
      "--depth",
      "1",
      "--single-branch",
      "--branch",
      "main",
      "https://x-access-token:token@github.com/RED-Internal-Development/audi-red-documentation.git",
      "/tmp/docs-sync-target"
      ]
    });
    expect(plan.checkoutArgs).toEqual(["checkout", "-b", "docs-sync/feature-apps"]);
  });
});
