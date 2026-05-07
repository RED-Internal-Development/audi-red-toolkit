import { describe, expect, test } from "vitest";

import {
  buildMetadataReport,
  parsePackageMetadata,
} from "../../actions/repo-metadata-collect/src/metadata.js";

describe("repo-metadata-collect metadata shaping", () => {
  test("parses package metadata and optional oneaudi-cli data", () => {
    const packageMetadata = parsePackageMetadata(
      JSON.stringify({
        name: "@oneaudi/fa-example",
        version: "1.2.3",
        dependencies: { react: "18.0.0" },
        devDependencies: { vitest: "4.1.5" },
        appStore: { team: "RED" },
        browserslist: [">0.2%"],
        repository: {
          type: "git",
          url: "https://github.com/RED-Internal-Development/example-repo.git",
        },
      }),
      "RED-Internal-Development/example-repo",
      JSON.stringify({ project: { awsDomain: "prod" } }),
    );

    expect(packageMetadata).toEqual({
      repoName: "@oneaudi/fa-example",
      repoVersion: "1.2.3",
      dependencies: { react: "18.0.0" },
      devDependencies: { vitest: "4.1.5" },
      appstoreData: { team: "RED" },
      browserlistData: [">0.2%"],
      repository: {
        type: "git",
        url: "https://github.com/RED-Internal-Development/example-repo.git",
      },
      awsDomain: "prod",
    });
  });

  test("builds the legacy-compatible metadata report shape", () => {
    const report = buildMetadataReport({
      packageMetadata: {
        repoName: "@oneaudi/fa-example",
        repoVersion: "1.2.3",
        dependencies: { react: "18.0.0" },
        devDependencies: { vitest: "4.1.5" },
        appstoreData: { team: "RED" },
        browserlistData: {},
        repository: { url: "https://github.com/example/repo" },
        awsDomain: "prod",
      },
      publishedVersion: "v1.2.0",
      releaseHistory: [
        {
          tag: "v1.2.0",
          name: "Release 1.2.0",
          date: "2026-05-01T00:00:00Z",
          notes: "Notes",
        },
      ],
      dependabotPrs: [
        "dependabot bump - https://example.invalid - Created at: 2026-05-01T00:00:00Z",
      ],
      npmAudit: { metadata: { vulnerabilities: { total: 0 } } },
    });

    expect(report).toEqual({
      "@oneaudi/fa-example": {
        repo_version: "1.2.3",
        awsDomain: "prod",
        published_version: "v1.2.0",
        release_history: [
          {
            tag: "v1.2.0",
            name: "Release 1.2.0",
            date: "2026-05-01T00:00:00Z",
            notes: "Notes",
          },
        ],
        dependabot_prs: [
          "dependabot bump - https://example.invalid - Created at: 2026-05-01T00:00:00Z",
        ],
        npm_audit: { metadata: { vulnerabilities: { total: 0 } } },
        repository: { url: "https://github.com/example/repo" },
        dependencies: { react: "18.0.0" },
        devDependencies: { vitest: "4.1.5" },
        appstoreData: { team: "RED" },
        browserlistData: {},
      },
    });
  });
});
