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
  commitMessage: undefined,
  rename: "app-name",
  useRsync: true,
  gitServer: "github.com",
  githubToken: "token",
};

describe("docs-sync git planning", () => {
  test("uses a branch-agnostic shallow clone and branch-specific checkout commands", () => {
    const plan = buildClonePlan(baseInputs, "/tmp/docs-sync-target");

    expect(plan).toMatchObject({
      cloneArgs: [
        "clone",
        "--depth",
        "1",
        "--no-single-branch",
        "https://x-access-token:token@github.com/RED-Internal-Development/audi-red-documentation.git",
        "/tmp/docs-sync-target",
      ],
      checkoutExistingArgs: [
        "checkout",
        "--track",
        "origin/docs-sync/feature-apps",
      ],
      checkoutNewArgs: ["checkout", "-b", "docs-sync/feature-apps"],
    });
  });
});
