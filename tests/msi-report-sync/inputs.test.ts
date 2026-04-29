import { describe, expect, test } from "vitest";

import { parseMsiReportSyncInputsFromRecord } from "../../actions/msi-report-sync/src/inputs.js";

const baseInputs = {
  dataFile: "audi-red-documentation/data/confluenceRepositoryReport.json",
  pageTitle: "oneAudi FA Repository Report",
  parentPageId: "12345",
  targetPageId: undefined,
  baseUrl: "https://collaboration.msi.audi.com/confluence",
  spaceKey: "AAA",
  token: "masked-token",
  csvFile: "audi-red-documentation/data/confluenceRepositoryReport.csv",
};

describe("msi-report-sync input parsing", () => {
  test("normalizes valid inputs", () => {
    expect(parseMsiReportSyncInputsFromRecord(baseInputs)).toEqual({
      dataFile: "audi-red-documentation/data/confluenceRepositoryReport.json",
      pageTitle: "oneAudi FA Repository Report",
      parentPageId: "12345",
      targetPageId: undefined,
      baseUrl: "https://collaboration.msi.audi.com/confluence",
      spaceKey: "AAA",
      token: "masked-token",
      csvFile: "audi-red-documentation/data/confluenceRepositoryReport.csv",
    });
  });

  test("defaults optional inputs when omitted", () => {
    expect(
      parseMsiReportSyncInputsFromRecord({
        ...baseInputs,
        csvFile: undefined,
      }),
    ).toMatchObject({
      csvFile: undefined,
    });
  });

  test("allows page-id-only mode", () => {
    expect(
      parseMsiReportSyncInputsFromRecord({
        ...baseInputs,
        pageTitle: undefined,
        parentPageId: undefined,
        targetPageId: "1941410045",
      }),
    ).toMatchObject({
      targetPageId: "1941410045",
      pageTitle: undefined,
      parentPageId: undefined,
    });
  });

  test("rejects missing page target", () => {
    expect(() =>
      parseMsiReportSyncInputsFromRecord({
        ...baseInputs,
        pageTitle: undefined,
        parentPageId: undefined,
        targetPageId: undefined,
      }),
    ).toThrow("MSI_INVALID_INPUT");
  });
});
