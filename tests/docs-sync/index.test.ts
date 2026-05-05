import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { run } from "../../actions/docs-sync/src/index.js";

describe("docs-sync validation", () => {
  test("fails before git sync when validation finds invalid content", async () => {
    const root = await mkdtemp(join(tmpdir(), "docs-sync-invalid-"));

    try {
      const source = join(root, "docs");
      await mkdir(source, { recursive: true });
      await writeFile(
        join(source, "Coverage.mdx"),
        "<table style='width: 100%'><tr><td>A</td></tr></table>\n",
        "utf8",
      );

      process.env.API_TOKEN_GITHUB = "token";
      process.env.INPUT_SOURCE_FILE = source;
      process.env.INPUT_DESTINATION_REPO =
        "RED-Internal-Development/audi-red-documentation";
      process.env.INPUT_DESTINATION_BRANCH = "docs-sync/test";
      process.env.INPUT_USER_EMAIL = "redsys1@audired.ca";
      process.env.INPUT_USER_NAME = "audired";
      process.env.INPUT_USER_ACTOR = "octocat";

      await expect(run()).rejects.toThrow("DOCSYNC_INVALID_CONTENT");
    } finally {
      delete process.env.API_TOKEN_GITHUB;
      delete process.env.INPUT_SOURCE_FILE;
      delete process.env.INPUT_DESTINATION_REPO;
      delete process.env.INPUT_DESTINATION_BRANCH;
      delete process.env.INPUT_USER_EMAIL;
      delete process.env.INPUT_USER_NAME;
      delete process.env.INPUT_USER_ACTOR;
      await rm(root, { recursive: true, force: true });
    }
  });
});
