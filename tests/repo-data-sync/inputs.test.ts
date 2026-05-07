import { describe, expect, test } from "vitest";

import { parseRepoDataSyncInputsFromRecord } from "../../actions/repo-data-sync/src/inputs.js";

describe("repo-data-sync input parsing", () => {
  test("parses required and optional inputs", () => {
    expect(
      parseRepoDataSyncInputsFromRecord({
        metadata_file: "metadata-report/metadata-report.json",
        collection_report_file: "collection-report/report.json",
        cypress_report_file: "audired-cypress-report/report.json",
        jest_report_file: "audired-jest-report/report.json",
        data_dir: "data",
        collection_output_dir: "collection-report",
        docs_destination_team_folder: "docs/feature-apps/team",
        docs_destination_app_folder: "docs/feature-apps/team/app",
        docs_branch: "main",
        app_type: "feature_app",
        profile_key: "feature_app",
        prod_support_enabled: "true",
      }),
    ).toEqual({
      metadataFile: "metadata-report/metadata-report.json",
      collectionReportFile: "collection-report/report.json",
      cypressReportFile: "audired-cypress-report/report.json",
      jestReportFile: "audired-jest-report/report.json",
      dataDir: "data",
      collectionOutputDir: "collection-report",
      docsDestinationTeamFolder: "docs/feature-apps/team",
      docsDestinationAppFolder: "docs/feature-apps/team/app",
      docsBranch: "main",
      appType: "feature_app",
      profileKey: "feature_app",
      prodSupportEnabled: true,
    });
  });

  test("rejects invalid booleans", () => {
    expect(() =>
      parseRepoDataSyncInputsFromRecord({
        metadata_file: "metadata-report/metadata-report.json",
        docs_destination_team_folder: "docs/team",
        docs_destination_app_folder: "docs/team/app",
        docs_branch: "main",
        prod_support_enabled: "yes",
      }),
    ).toThrow("REPORT_SYNC_INVALID_INPUT");
  });
});
