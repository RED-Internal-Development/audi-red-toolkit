import { describe, expect, test } from "vitest";

import { publishPage } from "../../actions/msi-sync/src/publish.js";
import {
  extractReferralId,
  PublishStats,
} from "../../actions/msi-sync/src/summary.js";

describe("msi-sync publish summary", () => {
  test("extracts referral ids from Confluence error payloads", () => {
    expect(extractReferralId('{"referralId":"ref-123"}')).toBe("ref-123");
  });

  test("renders a failing summary when page publish fails", () => {
    const stats = new PublishStats();
    stats.recordFailure("create", "Deployment (my-service)", "500", "ref-500");

    expect(stats.hasFailures()).toBe(true);
    expect(stats.renderSummary()).toContain("Deployment (my-service)");
    expect(stats.renderSummary()).toContain("ref-500");
  });

  test("updates an existing page under the same parent", async () => {
    const stats = new PublishStats();
    const calls: string[] = [];

    const client = {
      async getPagesByTitle() {
        return [
          {
            id: "11",
            title: "Deployment (my-service)",
            ancestors: [{ id: "901" }],
          },
        ];
      },
      async createPage() {
        calls.push("create");
        return { ok: true as const, id: "new" };
      },
      async updatePage() {
        calls.push("update");
        return { ok: true as const, id: "11" };
      },
    };

    const pageId = await publishPage(client, stats, {
      title: "Deployment (my-service)",
      html: "<p>Hello</p>",
      parentId: "901",
    });

    expect(pageId).toBe("11");
    expect(calls).toEqual(["update"]);
  });
});
