import { describe, expect, test } from "vitest";

import { discoverPublishTree } from "../../actions/msi-sync/src/discovery.js";

describe("msi-sync discovery", () => {
  test("discovers markdown files and collisions from fixture tree", async () => {
    const plan = await discoverPublishTree(
      "tests/msi-sync/fixtures/collision-tree/docs/backend_services_v2",
    );

    expect(plan.files.map((file) => file.relativePath)).toContain(
      "my-service/deployment/Deployment.md",
    );
    expect(plan.collisions).toEqual([
      {
        directoryPath: "my-service/deployment",
        filename: "Deployment.md",
      },
    ]);
  });
});
