import { describe, expect, test } from "vitest";

import {
  chooseExistingPage,
  isDirectoryFileCollision,
} from "../../actions/msi-sync/src/page-registry.js";

describe("msi-sync page registry", () => {
  test("detects same-stem directory and file collisions case-insensitively", () => {
    expect(isDirectoryFileCollision("deployment", "Deployment.md")).toBe(true);
  });

  test("prefers existing page under the requested parent", () => {
    const page = chooseExistingPage(
      [
        { id: "10", title: "Deployment (my-service)", ancestors: [{ id: "900" }] },
        { id: "11", title: "Deployment (my-service)", ancestors: [{ id: "901" }] },
      ],
      "Deployment (my-service)",
      "901",
    );

    expect(page?.id).toBe("11");
  });
});
