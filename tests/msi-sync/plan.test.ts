import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { buildPublishPlan } from "../../actions/msi-sync/src/plan.js";

describe("msi-sync publish planning", () => {
  test("builds a bucket-root publish plan with preserved titles", async () => {
    const plan = await buildPublishPlan({
      sourceRoot: "tests/msi-sync/fixtures/basic-tree/docs/backend_services_v2",
      parentPageId: "123",
    });

    expect(plan.warnings).toEqual([]);
    expect(plan.roots).toHaveLength(1);
    expect(plan.entries.map((entry) => ({
      relativePath: entry.relativePath,
      pageTitle: entry.pageTitle,
      pageKind: entry.pageKind,
      parent: entry.parent,
      deploymentRoot: entry.deploymentRoot.parentPageId,
    }))).toEqual([
      {
        relativePath: "my-service",
        pageTitle: "my-service (my-service)",
        pageKind: "directory",
        parent: { type: "page-id", value: "123" },
        deploymentRoot: "123",
      },
      {
        relativePath: "my-service/arb",
        pageTitle: "arb (my-service)",
        pageKind: "directory",
        parent: { type: "plan-entry", value: "base:123:dir:my-service" },
        deploymentRoot: "123",
      },
      {
        relativePath: "my-service/arb/README.md",
        pageTitle: "README (my-service)",
        pageKind: "nested-file",
        parent: { type: "plan-entry", value: "base:123:dir:my-service/arb" },
        deploymentRoot: "123",
      },
    ]);
  });

  test("adds synthetic deployment roots keyed by parent page id", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "msi-sync-plan-"));

    try {
      const deploymentConfig = join(workspace, "deployment-config.json");
      await writeFile(
        deploymentConfig,
        JSON.stringify(
          {
            "900": {
              folder_paths: ["my-service/arb"],
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const plan = await buildPublishPlan({
        sourceRoot: "tests/msi-sync/fixtures/basic-tree/docs/backend_services_v2",
        parentPageId: "123",
        deploymentConfigPath: deploymentConfig,
      });

      expect(plan.roots.map((root) => ({
        key: root.key,
        parentPageId: root.parentPageId,
        kind: root.kind,
        folderPaths: root.folderPaths,
      }))).toEqual([
        {
          key: "base:123",
          parentPageId: "123",
          kind: "base",
          folderPaths: [],
        },
        {
          key: "deployment:900",
          parentPageId: "900",
          kind: "deploymentConfig",
          folderPaths: ["my-service/arb"],
        },
      ]);

      expect(
        plan.entries
          .filter((entry) => entry.deploymentRoot.parentPageId === "900")
          .map((entry) => ({
            relativePath: entry.relativePath,
            pageTitle: entry.pageTitle,
            parent: entry.parent,
          })),
      ).toEqual([
        {
          relativePath: "my-service",
          pageTitle: "my-service (my-service)",
          parent: { type: "page-id", value: "900" },
        },
        {
          relativePath: "my-service/arb",
          pageTitle: "arb (my-service)",
          parent: { type: "plan-entry", value: "deployment:900:dir:my-service" },
        },
        {
          relativePath: "my-service/arb/README.md",
          pageTitle: "README (my-service)",
          parent: {
            type: "plan-entry",
            value: "deployment:900:dir:my-service/arb",
          },
        },
      ]);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("lets a same-stem markdown file own the folder title space", async () => {
    const plan = await buildPublishPlan({
      sourceRoot: "tests/msi-sync/fixtures/collision-tree/docs/backend_services_v2",
      parentPageId: "123",
    });

    expect(
      plan.entries.find((entry) => entry.relativePath === "my-service/deployment"),
    ).toBeUndefined();

    expect(
      plan.entries.map((entry) => ({
        relativePath: entry.relativePath,
        pageTitle: entry.pageTitle,
        pageKind: entry.pageKind,
        parent: entry.parent,
      })),
    ).toEqual([
      {
        relativePath: "my-service",
        pageTitle: "my-service (my-service)",
        pageKind: "directory",
        parent: { type: "page-id", value: "123" },
      },
      {
        relativePath: "my-service/deployment/Deployment.md",
        pageTitle: "Deployment (my-service)",
        pageKind: "file-owner",
        parent: { type: "plan-entry", value: "base:123:dir:my-service" },
      },
      {
        relativePath: "my-service/deployment/guide.md",
        pageTitle: "guide (my-service)",
        pageKind: "nested-file",
        parent: {
          type: "plan-entry",
          value: "base:123:file:my-service/deployment/Deployment.md",
        },
      },
    ]);
  });

  test("fails with an actionable error when deploymentConfig is malformed", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "msi-sync-plan-invalid-"));

    try {
      const deploymentConfig = join(workspace, "deployment-config.json");
      await writeFile(deploymentConfig, '{"900":{"folder_paths":"bad"}}', "utf8");

      await expect(
        buildPublishPlan({
          sourceRoot: "tests/msi-sync/fixtures/basic-tree/docs/backend_services_v2",
          parentPageId: "123",
          deploymentConfigPath: deploymentConfig,
        }),
      ).rejects.toThrow("deploymentConfig");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });

  test("warns and keeps the base root when deploymentConfig is missing", async () => {
    const plan = await buildPublishPlan({
      sourceRoot: "tests/msi-sync/fixtures/basic-tree/docs/backend_services_v2",
      parentPageId: "123",
      deploymentConfigPath: "tests/msi-sync/fixtures/missing-config.json",
    });

    expect(plan.warnings).toEqual([
      "Deployment config 'tests/msi-sync/fixtures/missing-config.json' not found, skipping.",
    ]);
    expect(plan.roots).toHaveLength(1);
    expect(plan.roots[0]?.key).toBe("base:123");
  });
});

afterEach(() => {
  delete process.env.INPUT_DEPLOYMENTCONFIG;
});
