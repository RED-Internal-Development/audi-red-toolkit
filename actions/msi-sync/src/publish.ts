import type { ConfluenceClient } from "./confluence-client.js";
import { chooseExistingPage } from "./page-registry.js";
import { extractReferralId, PublishStats } from "./summary.js";

export interface PublishablePage {
  title: string;
  html: string;
  parentId?: string;
}

export async function publishPage(
  client: ConfluenceClient,
  stats: PublishStats,
  page: PublishablePage,
): Promise<string | undefined> {
  const existing = chooseExistingPage(
    await client.getPagesByTitle(page.title),
    page.title,
    page.parentId,
  );

  if (existing) {
    const result = await client.updatePage({
      id: existing.id,
      title: page.title,
      html: page.html,
      parentId: page.parentId,
    });

    if (!result.ok) {
      stats.recordFailure(
        "update",
        page.title,
        result.statusCode,
        extractReferralId(result.body),
      );
      return undefined;
    }

    return result.id;
  }

  const result = await client.createPage(page);

  if (!result.ok) {
    stats.recordFailure(
      "create",
      page.title,
      result.statusCode,
      extractReferralId(result.body),
    );
    return undefined;
  }

  return result.id;
}
