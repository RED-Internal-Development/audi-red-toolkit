import * as core from "@actions/core";
import { access, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  ActionError,
  isActionError,
} from "../../../packages/action-common/src/errors.js";
import {
  type ConfluenceClient,
  ConfluenceHttpClient,
} from "../../msi-sync/src/confluence-client.js";
import {
  publishFilePage,
  type PublishableAttachment,
} from "../../msi-sync/src/publish.js";
import { extractReferralId, PublishStats } from "../../msi-sync/src/summary.js";
import { type MsiReportSyncInputs, readMsiReportSyncInputs } from "./inputs.js";
import {
  type ConfluenceRepositoryReportData,
  renderConfluenceRepositoryReport,
} from "./render.js";

interface SyncRuntimeOptions {
  createClient?: (inputs: MsiReportSyncInputs) => ConfluenceClient;
}

export async function executeMsiReportSync(
  inputs: MsiReportSyncInputs,
  options: SyncRuntimeOptions = {},
): Promise<{ pageId: string; attachmentCount: number }> {
  const dataFile = resolve(inputs.dataFile);
  const csvFile = inputs.csvFile ? resolve(inputs.csvFile) : undefined;

  await ensureFileExists(dataFile, "dataFile");
  if (csvFile) {
    await ensureFileExists(csvFile, "csvFile");
  }

  const report = validateReportData(
    JSON.parse(await readFile(dataFile, "utf8")) as unknown,
  );
  const html = renderConfluenceRepositoryReport(report);
  const attachments = await loadAttachments({
    dataFile,
    csvFile,
  });
  const client =
    options.createClient?.(inputs) ??
    new ConfluenceHttpClient({
      baseUrl: inputs.baseUrl,
      spaceKey: inputs.spaceKey,
      token: inputs.token,
    });
  const stats = new PublishStats();
  const pageId = await publishReportPage(
    client,
    stats,
    inputs,
    html,
    attachments,
  );

  await core.summary
    .addHeading("MSI Report Sync")
    .addCodeBlock(
      [
        `page-title | ${inputs.pageTitle}`,
        `page-id | ${pageId}`,
        `rows | ${report.rows.length}`,
        `attachments | ${attachments.length}`,
        "status | success",
      ].join("\n"),
      "text",
    )
    .write();

  return { pageId, attachmentCount: attachments.length };
}

export async function run(): Promise<void> {
  const inputs = readMsiReportSyncInputs();

  core.info(
    `Preparing MSI report sync from ${inputs.dataFile} into space ${inputs.spaceKey}.`,
  );

  const result = await executeMsiReportSync(inputs);
  core.notice(
    `MSI report sync published page ${result.pageId} with ${result.attachmentCount} attachment(s).`,
  );
}

async function ensureFileExists(
  filePath: string,
  inputName: string,
): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new ActionError(
      "MSI_INVALID_INPUT",
      "validate_inputs",
      `${inputName} must reference an existing file.`,
    );
  }
}

function validateReportData(value: unknown): ConfluenceRepositoryReportData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ActionError(
      "MSI_INVALID_INPUT",
      "validate_inputs",
      "dataFile must contain a JSON object.",
    );
  }

  const report = value as Partial<ConfluenceRepositoryReportData>;

  if (
    !Array.isArray(report.rows) ||
    !Array.isArray(report.columns) ||
    !report.summary
  ) {
    throw new ActionError(
      "MSI_INVALID_INPUT",
      "validate_inputs",
      "dataFile does not match the expected repository report contract.",
    );
  }

  return report as ConfluenceRepositoryReportData;
}

async function loadAttachments(options: {
  dataFile: string;
  csvFile: string | undefined;
}): Promise<PublishableAttachment[]> {
  const attachments: PublishableAttachment[] = [
    {
      filename: basename(options.dataFile),
      data: new Uint8Array(await readFile(options.dataFile)),
      contentType: "application/json",
    },
  ];

  if (options.csvFile) {
    attachments.push({
      filename: basename(options.csvFile),
      data: new Uint8Array(await readFile(options.csvFile)),
      contentType: "text/csv",
    });
  }

  return attachments;
}

async function publishReportPage(
  client: ConfluenceClient,
  stats: PublishStats,
  inputs: MsiReportSyncInputs,
  html: string,
  attachments: PublishableAttachment[],
): Promise<string> {
  if (inputs.targetPageId) {
    const existingPage = await client.getPageById(inputs.targetPageId);
    const updateResult = await client.updatePage({
      id: inputs.targetPageId,
      title: inputs.pageTitle ?? existingPage.title,
      html,
      parentId: inputs.parentPageId,
    });

    if (!updateResult.ok) {
      stats.recordFailure(
        "update",
        inputs.pageTitle ?? existingPage.title,
        updateResult.statusCode,
        extractReferralId(updateResult.body),
      );
      throw new ActionError(
        "MSI_PARTIAL_PUBLISH_FAILURE",
        "publish",
        stats.renderSummary(),
      );
    }

    await uploadAttachmentsForPage(
      client,
      stats,
      inputs.targetPageId,
      attachments,
    );

    if (stats.hasFailures()) {
      throw new ActionError(
        "MSI_PARTIAL_PUBLISH_FAILURE",
        "publish",
        stats.renderSummary(),
      );
    }

    return inputs.targetPageId;
  }

  const page = await publishFilePage(client, stats, {
    title: inputs.pageTitle!,
    html,
    parentId: inputs.parentPageId,
    attachments,
  });

  if (!page || stats.hasFailures()) {
    throw new ActionError(
      "MSI_PARTIAL_PUBLISH_FAILURE",
      "publish",
      stats.renderSummary(),
    );
  }

  return page.pageId;
}

async function uploadAttachmentsForPage(
  client: ConfluenceClient,
  stats: PublishStats,
  pageId: string,
  attachments: PublishableAttachment[],
): Promise<void> {
  if (attachments.length === 0) {
    return;
  }

  const existingAttachments = await client.listPageAttachments(pageId);
  const existingByName = new Map(
    existingAttachments.map((attachment) => [
      attachment.title.toLowerCase(),
      attachment,
    ]),
  );

  for (const attachment of attachments) {
    const existing = existingByName.get(attachment.filename.toLowerCase());
    const result = existing
      ? await client.updateAttachment({
          pageId,
          attachmentId: existing.id,
          filename: attachment.filename,
          data: attachment.data,
          contentType: attachment.contentType,
        })
      : await client.createAttachment({
          pageId,
          filename: attachment.filename,
          data: attachment.data,
          contentType: attachment.contentType,
        });

    if (!result.ok) {
      stats.recordFailure(
        "upload",
        attachment.filename,
        result.statusCode,
        extractReferralId(result.body),
        {
          targetType: "attachment",
          parentTitle: pageId,
        },
      );
    }
  }
}

function handleRunFailure(error: unknown): void {
  if (isActionError(error)) {
    core.setFailed(error.message);
    return;
  }

  core.setFailed(error instanceof Error ? error.message : String(error));
}

if (process.env.VITEST !== "true") {
  run().catch(handleRunFailure);
}
