import { describe, expect, test } from "vitest";

import {
  getDirectoryPageTitle,
  getFilePageTitle,
  resolveAppName,
} from "../../actions/msi-sync/src/page-titles.js";

describe("msi-sync page titles", () => {
  test("preserves legacy title format", () => {
    expect(getDirectoryPageTitle("deployment", "my-service")).toBe(
      "deployment (my-service)",
    );
    expect(getFilePageTitle("Deployment.md", "my-service")).toBe(
      "Deployment (my-service)",
    );
  });

  test("resolves app name from first segment under bucket root", () => {
    expect(
      resolveAppName("docs/backend_services_v2", "docs/backend_services_v2/my-service/arb"),
    ).toBe("my-service");
  });
});
