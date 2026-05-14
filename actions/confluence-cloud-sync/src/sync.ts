import * as core from "@actions/core";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { ActionError } from "../../../packages/action-common/src/errors.js";
import type { PublishPlan, PublishPlanEntry } from "../../msi-sync/src/plan.js";
import type { ConfluenceClient } from "../../msi-sync/src/confluence-client.js";
import {
  publishDirectoryPage,
  publishFilePage,
  type PublishableAttachment,
} from "../../msi-sync/src/publish.js";
import {
  renderDirectoryTitleHtml,
  renderMarkdownToHtml,
} from "../../msi-sync/src/render.js";
import {
  rewriteAttachmentReferences,
  stageMarkdownPage,
} from "../../msi-sync/src/staging.js";
import { extractReferralId, PublishStats } from "../../msi-sync/src/summary.js";
import { ConfluenceCloudHttpClient } from "./confluence-client.js";
import type { ConfluenceCloudSyncInputs } from "./inputs.js";

interface SyncRuntimeOptions {
  createClient?: (inputs: ConfluenceCloudSyncInputs) => ConfluenceClient;
}

export async function executeConfluenceCloudSync(
  inputs: ConfluenceCloudSyncInputs,
  publishPlan: PublishPlan,
  stats: PublishStats,
  options: SyncRuntimeOptions = {},
): Promise<{ publishedPages: number }> {
  const stageRoot = await mkdtemp(
    join(tmpdir(), "confluence-cloud-sync-stage-"),
  );
  const client =
    options.createClient?.(inputs) ??
    new ConfluenceCloudHttpClient({
      baseUrl: inputs.baseUrl,
      spaceKey: inputs.spaceKey,
      username: inputs.username,
      token: inputs.token,
    });
  const publishedPageIds = new Map<string, string>();
  const planEntriesById = new Map(
    publishPlan.entries.map((entry) => [entry.id, entry]),
  );
  let publishedPages = 0;

  try {
    for (const [index, entry] of publishPlan.entries.entries()) {
      const parentId = resolveParentId(
        entry,
        publishedPageIds,
        planEntriesById,
        stats,
      );
      if (!parentId) {
        continue;
      }

      if (entry.pageKind === "directory") {
        const result = await publishDirectoryPage(client, stats, {
          title: entry.pageTitle,
          html: renderDirectoryTitleHtml(entry.pageTitle),
          parentId,
        });

        if (!result) {
          continue;
        }

        publishedPages += 1;
        publishedPageIds.set(entry.id, result.pageId);
        continue;
      }

      if (!entry.sourceFilePath) {
        stats.recordFailure("read", entry.pageTitle, "ERROR", undefined, {
          parentTitle: entry.pageTitle,
        });
        continue;
      }

      const pageStageDirectory = join(
        stageRoot,
        `${String(index + 1).padStart(4, "0")}-${sanitizePathComponent(entry.id)}`,
      );
      const stagedPage = await stageMarkdownPage({
        markdownFilePath: entry.sourceFilePath,
        stageDirectory: pageStageDirectory,
        diagramsSource: inputs.diagramsSource,
      });
      const publishableAttachments = await toPublishableAttachments(stagedPage);
      const initialHtml = await renderMarkdownToHtml(stagedPage.stagedMarkdown);
      const pageResult = await publishFilePage(client, stats, {
        title: entry.pageTitle,
        html: initialHtml,
        parentId,
        attachments: publishableAttachments,
      });

      if (!pageResult) {
        continue;
      }

      publishedPages += 1;
      publishedPageIds.set(entry.id, pageResult.pageId);

      if (publishableAttachments.length === 0) {
        continue;
      }

      const finalMarkdown = rewriteAttachmentReferences(
        stagedPage.stagedMarkdown,
        buildAttachmentUrlMap(inputs.baseUrl, pageResult.pageId, [
          ...stagedPage.attachments.map((attachment) => ({
            reference: attachment.stagedRelativePath,
            filename: basename(attachment.stagedPath),
          })),
          ...stagedPage.mermaidOutputs.map((output) => ({
            reference: output.outputRelativePath,
            filename: basename(output.outputPath),
          })),
        ]),
      );
      const finalHtml = await renderMarkdownToHtml(finalMarkdown);
      const updateResult = await client.updatePage({
        id: pageResult.pageId,
        title: entry.pageTitle,
        html: finalHtml,
        parentId,
      });

      if (!updateResult.ok) {
        stats.recordFailure(
          "update",
          entry.pageTitle,
          updateResult.statusCode,
          extractReferralId(updateResult.body),
          {
            responseBody: updateResult.body,
          },
        );
      }
    }
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }

  await writeStepSummary(publishPlan, publishedPages, stats);

  return { publishedPages };
}

function resolveParentId(
  entry: PublishPlanEntry,
  publishedPageIds: Map<string, string>,
  planEntriesById: Map<string, PublishPlanEntry>,
  stats: PublishStats,
): string | undefined {
  if (entry.parent.type === "page-id") {
    return entry.parent.value;
  }

  const parentId = publishedPageIds.get(entry.parent.value);
  if (parentId) {
    return parentId;
  }

  const parentEntry = planEntriesById.get(entry.parent.value);
  stats.recordFailure("parent", entry.pageTitle, "SKIPPED", undefined, {
    parentTitle: parentEntry?.pageTitle,
  });
  return undefined;
}

async function toPublishableAttachments(
  stagedPage: Awaited<ReturnType<typeof stageMarkdownPage>>,
): Promise<PublishableAttachment[]> {
  const attachments: PublishableAttachment[] = [];

  for (const attachment of stagedPage.attachments) {
    attachments.push({
      filename: basename(attachment.stagedPath),
      data: await readBinary(attachment.stagedPath),
      contentType: detectContentType(attachment.stagedPath),
    });
  }

  for (const output of stagedPage.mermaidOutputs) {
    attachments.push({
      filename: basename(output.outputPath),
      data: await readBinary(output.outputPath),
      contentType: "image/svg+xml",
    });
  }

  return attachments;
}

async function readBinary(filePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(filePath));
}

/**
 * Builds attachment URL map for Confluence Cloud.
 *
 * Confluence Cloud attachment download path uses the `/wiki` prefix:
 *   `{baseUrl}/wiki/download/attachments/{pageId}/{filename}`
 *
 * This differs from MSI (Data Center) which uses:
 *   `{baseUrl}/download/attachments/{pageId}/{filename}`
 */
function buildAttachmentUrlMap(
  baseUrl: string,
  pageId: string,
  attachments: Array<{ reference: string; filename: string }>,
): Map<string, string> {
  const trimmedBaseUrl = baseUrl.replace(/\/+$/, "");

  return new Map(
    attachments.map((attachment) => [
      attachment.reference,
      `${trimmedBaseUrl}/wiki/download/attachments/${encodeURIComponent(pageId)}/${encodeURIComponent(attachment.filename)}`,
    ]),
  );
}

function detectContentType(filePath: string): string {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith(".png")) {
    return "image/png";
  }
  if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerPath.endsWith(".gif")) {
    return "image/gif";
  }
  if (lowerPath.endsWith(".bmp")) {
    return "image/bmp";
  }
  if (lowerPath.endsWith(".tiff") || lowerPath.endsWith(".tif")) {
    return "image/tiff";
  }
  if (lowerPath.endsWith(".svg")) {
    return "image/svg+xml";
  }
  return "application/octet-stream";
}

function sanitizePathComponent(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function writeStepSummary(
  publishPlan: PublishPlan,
  publishedPages: number,
  stats: PublishStats,
): Promise<void> {
  const filePages = publishPlan.entries.filter(
    (entry) => entry.sourceFilePath,
  ).length;
  const warningLines = publishPlan.warnings.map(
    (warning) => `warning | ${warning}`,
  );
  const summaryLines = [
    `publish-roots | ${publishPlan.roots.length}`,
    `file-pages | ${filePages}`,
    `published-pages | ${publishedPages}`,
    ...warningLines,
  ];

  if (stats.hasFailures()) {
    summaryLines.push(stats.renderSummary());
  } else {
    summaryLines.push("status | success");
  }

  await core.summary
    .addHeading("Confluence Cloud Sync")
    .addCodeBlock(summaryLines.join("\n"), "text")
    .write();
}
