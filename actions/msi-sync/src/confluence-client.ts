export interface ConfluencePage {
  id: string;
  title: string;
  ancestors?: Array<{ id: string }>;
}

export interface ConfluenceAttachment {
  id: string;
  title: string;
  mediaType?: string;
}

export interface ConfluenceMutationSuccess {
  ok: true;
  id: string;
  title?: string;
}

export interface ConfluenceMutationFailure {
  ok: false;
  statusCode: string;
  body: string;
}

export type ConfluenceMutationResult =
  | ConfluenceMutationSuccess
  | ConfluenceMutationFailure;

export interface ConfluenceAttachmentInput {
  pageId: string;
  filename: string;
  data: Uint8Array;
  contentType?: string;
}

export interface ConfluenceAttachmentUpdateInput
  extends ConfluenceAttachmentInput {
  attachmentId: string;
}

export interface ConfluenceClient {
  getPagesByTitle(title: string): Promise<ConfluencePage[]>;
  getPageVersion(pageId: string): Promise<number>;
  createPage(input: {
    title: string;
    html: string;
    parentId?: string;
  }): Promise<ConfluenceMutationResult>;
  updatePage(input: {
    id: string;
    title: string;
    html: string;
    parentId?: string;
  }): Promise<ConfluenceMutationResult>;
  listPageAttachments(pageId: string): Promise<ConfluenceAttachment[]>;
  createAttachment(
    input: ConfluenceAttachmentInput,
  ): Promise<ConfluenceMutationResult>;
  updateAttachment(
    input: ConfluenceAttachmentUpdateInput,
  ): Promise<ConfluenceMutationResult>;
}

interface ConfluenceHttpClientOptions {
  baseUrl: string;
  spaceKey: string;
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

export class ConfluenceRequestError extends Error {
  readonly statusCode: string;
  readonly body: string;

  constructor(
    readonly method: string,
    readonly url: string,
    statusCode: number,
    body: string,
  ) {
    super(`Confluence request failed: ${method} ${url} (${statusCode})`);
    this.name = "ConfluenceRequestError";
    this.statusCode = String(statusCode);
    this.body = body;
  }
}

export class ConfluenceHttpClient implements ConfluenceClient {
  private readonly apiBaseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly options: ConfluenceHttpClientOptions) {
    this.apiBaseUrl = `${options.baseUrl.replace(/\/+$/, "")}/rest/api`;
    this.doFetch = options.fetch ?? fetch;
  }

  async getPagesByTitle(title: string): Promise<ConfluencePage[]> {
    const searchParams = new URLSearchParams({
      spaceKey: this.options.spaceKey,
      title,
      expand: "ancestors",
      type: "page",
    });
    const response = await this.requestJson<ConfluenceCollectionResponse<ConfluencePage>>(
      `/content?${searchParams.toString()}`,
    );

    return response.results ?? [];
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
      ancestors: input.parentId ? [{ id: input.parentId }] : [],
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
          ancestors: input.parentId ? [{ id: input.parentId }] : [],
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
      if (error instanceof ConfluenceRequestError) {
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
      throw new ConfluenceRequestError(
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

    const body = (await response.json()) as ConfluenceCollectionResponse<ConfluenceAttachmentResponse>;
    const attachment = body.results?.[0];

    return {
      ok: true,
      id: attachment?.id ?? "",
      title: attachment?.title,
    };
  }

  private baseHeaders(): Record<string, string> {
    return {
      Accept: "application/json",
      Authorization: `Bearer ${this.options.token}`,
    };
  }

  private toUrl(path: string): string {
    return `${this.apiBaseUrl}${path}`;
  }
}
