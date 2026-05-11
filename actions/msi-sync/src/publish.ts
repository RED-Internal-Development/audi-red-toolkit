import {
  ConfluenceRequestError,
  type ConfluenceAttachment,
  type ConfluenceClient,
} from "./confluence-client.js";
import { chooseExistingPage } from "./page-registry.js";
import { extractReferralId, PublishStats } from "./summary.js";

export interface PublishableAttachment {
  filename: string;
  data: Uint8Array;
  contentType?: string;
}

export interface PublishablePage {
  title: string;
  html: string;
  parentId?: string;
  attachments?: PublishableAttachment[];
}

export interface PublishedAttachmentResult {
  attachmentId: string;
  filename: string;
  operation: "created" | "updated";
}

export interface PublishedPageResult {
  pageId: string;
  pageTitle: string;
  pageKind: "directory" | "file";
  pageOperation: "created" | "updated";
  attachmentStrategy: "none" | "create-all" | "upsert-existing";
  attachmentResults: PublishedAttachmentResult[];
}

export async function publishPage(
  client: ConfluenceClient,
  stats: PublishStats,
  page: PublishablePage,
): Promise<string | undefined> {
  const result = await publishTypedPage(client, stats, "file", page);
  return result?.pageId;
}

export function publishDirectoryPage(
  client: ConfluenceClient,
  stats: PublishStats,
  page: PublishablePage,
): Promise<PublishedPageResult | undefined> {
  return publishTypedPage(client, stats, "directory", page);
}

export function publishFilePage(
  client: ConfluenceClient,
  stats: PublishStats,
  page: PublishablePage,
): Promise<PublishedPageResult | undefined> {
  return publishTypedPage(client, stats, "file", page);
}

async function publishTypedPage(
  client: ConfluenceClient,
  stats: PublishStats,
  pageKind: "directory" | "file",
  page: PublishablePage,
): Promise<PublishedPageResult | undefined> {
  let existingPages;

  try {
    existingPages = await client.getPagesByTitle(page.title);
  } catch (error) {
    recordRequestFailure(stats, "lookup", page.title, error);
    return undefined;
  }

  const existing = chooseExistingPage(existingPages, page.title, page.parentId);
  const pageResult = existing
    ? await client.updatePage({
        id: existing.id,
        title: page.title,
        html: page.html,
        parentId: page.parentId,
      })
    : await client.createPage(page);
  const pageOperation = existing ? "updated" : "created";

  if (!pageResult.ok) {
    stats.recordFailure(
      existing ? "update" : "create",
      page.title,
      pageResult.statusCode,
      extractReferralId(pageResult.body),
      {
        responseBody: pageResult.body,
      },
    );
    return undefined;
  }

  const attachmentResults = await publishAttachments(
    client,
    stats,
    pageResult.id,
    page.title,
    pageOperation,
    page.attachments ?? [],
  );

  if (!attachmentResults) {
    return undefined;
  }

  return {
    pageId: pageResult.id,
    pageTitle: page.title,
    pageKind,
    pageOperation,
    attachmentStrategy: page.attachments?.length
      ? pageOperation === "created"
        ? "create-all"
        : "upsert-existing"
      : "none",
    attachmentResults,
  };
}

async function publishAttachments(
  client: ConfluenceClient,
  stats: PublishStats,
  pageId: string,
  pageTitle: string,
  pageOperation: "created" | "updated",
  attachments: PublishableAttachment[],
): Promise<PublishedAttachmentResult[] | undefined> {
  if (attachments.length === 0) {
    return [];
  }

  const results: PublishedAttachmentResult[] = [];
  let existingAttachmentsByTitle = new Map<string, ConfluenceAttachment>();

  if (pageOperation === "updated") {
    try {
      const existingAttachments = await client.listPageAttachments(pageId);
      existingAttachmentsByTitle = new Map(
        existingAttachments.map((attachment) => [
          attachment.title.toLowerCase(),
          attachment,
        ]),
      );
    } catch (error) {
      recordRequestFailure(stats, "list", pageTitle, error, {
        targetType: "attachment",
        parentTitle: pageTitle,
      });
      return undefined;
    }
  }

  let hasFailure = false;

  for (const attachment of attachments) {
    const existing = existingAttachmentsByTitle.get(
      attachment.filename.toLowerCase(),
    );
    const uploadResult = existing
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

    if (!uploadResult.ok) {
      hasFailure = true;
      stats.recordFailure(
        "upload",
        attachment.filename,
        uploadResult.statusCode,
        extractReferralId(uploadResult.body),
        {
          targetType: "attachment",
          parentTitle: pageTitle,
          responseBody: uploadResult.body,
        },
      );
      continue;
    }

    results.push({
      attachmentId: uploadResult.id,
      filename: attachment.filename,
      operation: existing ? "updated" : "created",
    });
  }

  return hasFailure ? undefined : results;
}

function recordRequestFailure(
  stats: PublishStats,
  operation: string,
  title: string,
  error: unknown,
  context?: { targetType?: "page" | "attachment"; parentTitle?: string },
): void {
  if (error instanceof ConfluenceRequestError) {
    stats.recordFailure(
      operation,
      title,
      error.statusCode,
      extractReferralId(error.body),
      {
        ...context,
        responseBody: error.body,
      },
    );
    return;
  }

  stats.recordFailure(operation, title, "ERROR", undefined, context);
}
