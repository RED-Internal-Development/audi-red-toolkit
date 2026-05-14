import type {
  ConfluenceAttachment,
  ConfluenceAttachmentInput,
  ConfluenceAttachmentUpdateInput,
  ConfluenceClient,
  ConfluenceMutationResult,
  ConfluencePage,
} from "../../msi-sync/src/confluence-client.js";

export type {
  ConfluenceAttachment,
  ConfluenceAttachmentInput,
  ConfluenceAttachmentUpdateInput,
  ConfluenceClient,
  ConfluenceMutationResult,
  ConfluencePage,
};

export { ConfluenceRequestError } from "../../msi-sync/src/confluence-client.js";

interface ConfluenceCloudHttpClientOptions {
  baseUrl: string;
  spaceKey: string;
  username: string;
  token: string;
  fetch?: typeof fetch;
}

interface ConfluenceCollectionResponse<T> {
  results?: T[];
}

interface ConfluencePageVersionResponse {
  version?: { number?: number };
}

interface ConfluenceContentResponse {
  id?: string;
  title?: string;
}

interface ConfluenceAttachmentResponse {
  id?: string;
  title?: string;
}

import { ConfluenceRequestError as _ConfluenceRequestError } from "../../msi-sync/src/confluence-client.js";

/**
 * Confluence Cloud HTTP client.
 *
 * Differences from ConfluenceHttpClient (MSI / Data Center):
 * - Authentication: Basic auth (Base64 username:token) instead of Bearer PAT.
 * - API base path: `{baseUrl}/wiki/rest/api` instead of `{baseUrl}/rest/api`.
 */
export class ConfluenceCloudHttpClient implements ConfluenceClient {
  private readonly apiBaseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly options: ConfluenceCloudHttpClientOptions) {
    this.apiBaseUrl = `${options.baseUrl.replace(/\/+$/, "")}/wiki/rest/api`;
    this.doFetch = options.fetch ?? fetch;
  }

  async getPagesByTitle(title: string): Promise<ConfluencePage[]> {
    const searchParams = new URLSearchParams({
      spaceKey: this.options.spaceKey,
      title,
      expand: "ancestors",
      type: "page",
    });
    const response = await this.requestJson<
      ConfluenceCollectionResponse<ConfluencePage>
    >(`/content?${searchParams.toString()}`);

    return response.results ?? [];
  }

  async getPageById(
    pageId: string,
    expand = "ancestors",
  ): Promise<ConfluencePage> {
    return this.requestJson<ConfluencePage>(
      `/content/${encodeURIComponent(pageId)}?expand=${encodeURIComponent(expand)}`,
    );
  }

  async getPageVersion(pageId: string): Promise<number> {
    const response = await this.requestJson<ConfluencePageVersionResponse>(
      `/content/${encodeURIComponent(pageId)}?expand=version`,
    );
    const version = response.version?.number;

    if (typeof version !== "number") {
      throw new Error(`Confluence page ${pageId} did not return a version.`);
    }

    return version;
  }

  async createPage(input: {
    title: string;
    html: string;
    parentId?: string;
  }): Promise<ConfluenceMutationResult> {
    return this.mutateJson("/content", "POST", {
      type: "page",
      title: input.title,
      space: { key: this.options.spaceKey },
      ...(input.parentId ? { ancestors: [{ id: input.parentId }] } : {}),
      body: {
        storage: {
          value: input.html,
          representation: "storage",
        },
      },
    });
  }

  async updatePage(input: {
    id: string;
    title: string;
    html: string;
    parentId?: string;
  }): Promise<ConfluenceMutationResult> {
    try {
      const currentVersion = await this.getPageVersion(input.id);

      return this.mutateJson(
        `/content/${encodeURIComponent(input.id)}`,
        "PUT",
        {
          id: input.id,
          type: "page",
          title: input.title,
          space: { key: this.options.spaceKey },
          ...(input.parentId ? { ancestors: [{ id: input.parentId }] } : {}),
          version: { number: currentVersion + 1 },
          body: {
            storage: {
              value: input.html,
              representation: "storage",
            },
          },
        },
      );
    } catch (error) {
      if (error instanceof _ConfluenceRequestError) {
        return {
          ok: false,
          statusCode: error.statusCode,
          body: error.body,
        };
      }

      throw error;
    }
  }

  async listPageAttachments(pageId: string): Promise<ConfluenceAttachment[]> {
    const response = await this.requestJson<
      ConfluenceCollectionResponse<ConfluenceAttachment>
    >(`/content/${encodeURIComponent(pageId)}/child/attachment`);

    return response.results ?? [];
  }

  async createAttachment(
    input: ConfluenceAttachmentInput,
  ): Promise<ConfluenceMutationResult> {
    return this.uploadAttachment(
      `/content/${encodeURIComponent(input.pageId)}/child/attachment`,
      input,
    );
  }

  async updateAttachment(
    input: ConfluenceAttachmentUpdateInput,
  ): Promise<ConfluenceMutationResult> {
    return this.uploadAttachment(
      `/content/${encodeURIComponent(input.pageId)}/child/attachment/${encodeURIComponent(input.attachmentId)}/data`,
      input,
    );
  }

  private async requestJson<T>(path: string): Promise<T> {
    const response = await this.doFetch(this.toUrl(path), {
      method: "GET",
      headers: this.baseHeaders(),
    });

    if (!response.ok) {
      throw new _ConfluenceRequestError(
        "GET",
        this.toUrl(path),
        response.status,
        await response.text(),
      );
    }

    return (await response.json()) as T;
  }

  private async mutateJson(
    path: string,
    method: "POST" | "PUT",
    payload: unknown,
  ): Promise<ConfluenceMutationResult> {
    const response = await this.doFetch(this.toUrl(path), {
      method,
      headers: {
        ...this.baseHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        ok: false,
        statusCode: String(response.status),
        body: await response.text(),
      };
    }

    const body = (await response.json()) as ConfluenceContentResponse;

    return {
      ok: true,
      id: body.id ?? "",
      title: body.title,
    };
  }

  private async uploadAttachment(
    path: string,
    input: ConfluenceAttachmentInput,
  ): Promise<ConfluenceMutationResult> {
    const formData = new FormData();
    const fileBytes = new Uint8Array(input.data);
    formData.append(
      "file",
      new File([fileBytes], input.filename, {
        type: input.contentType ?? "application/octet-stream",
      }),
    );
    formData.append("minorEdit", "true");

    const response = await this.doFetch(this.toUrl(path), {
      method: "POST",
      headers: {
        ...this.baseHeaders(),
        "X-Atlassian-Token": "no-check",
      },
      body: formData,
    });

    if (!response.ok) {
      return {
        ok: false,
        statusCode: String(response.status),
        body: await response.text(),
      };
    }

    const body =
      (await response.json()) as ConfluenceCollectionResponse<ConfluenceAttachmentResponse>;
    const attachment = body.results?.[0];

    return {
      ok: true,
      id: attachment?.id ?? "",
      title: attachment?.title,
    };
  }

  /**
   * Produces Basic auth header using Atlassian account email and API token.
   * Confluence Cloud requires `Authorization: Basic base64(email:api_token)`.
   */
  private baseHeaders(): Record<string, string> {
    const credentials = Buffer.from(
      `${this.options.username}:${this.options.token}`,
    ).toString("base64");
    return {
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
    };
  }

  private toUrl(path: string): string {
    return `${this.apiBaseUrl}${path}`;
  }
}
