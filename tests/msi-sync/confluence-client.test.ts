import { describe, expect, test, vi } from "vitest";

import {
  ConfluenceHttpClient,
  ConfluenceRequestError,
} from "../../actions/msi-sync/src/confluence-client.js";

type FetchCall = [string, RequestInit | undefined];

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getFetchCall(fetchMock: ReturnType<typeof vi.fn>, index: number): FetchCall {
  return fetchMock.mock.calls[index] as FetchCall;
}

describe("msi-sync ConfluenceHttpClient", () => {
  test("looks up pages by title with ancestors expanded", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        results: [{ id: "11", title: "Deployment", ancestors: [{ id: "901" }] }],
      }),
    );
    const client = new ConfluenceHttpClient({
      baseUrl: "https://example.invalid/confluence/",
      spaceKey: "AAA",
      token: "secret",
      fetch: fetchMock,
    });

    const pages = await client.getPagesByTitle("Deployment");
    const firstCall = getFetchCall(fetchMock, 0);

    expect(pages).toEqual([
      { id: "11", title: "Deployment", ancestors: [{ id: "901" }] },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstCall[0]).toBe(
      "https://example.invalid/confluence/rest/api/content?spaceKey=AAA&title=Deployment&expand=ancestors&type=page",
    );
    expect(firstCall[1]).toMatchObject({
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer secret",
      },
    });
  });

  test("fetches the current page version", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        id: "11",
        version: { number: 4 },
      }),
    );
    const client = new ConfluenceHttpClient({
      baseUrl: "https://example.invalid/confluence",
      spaceKey: "AAA",
      token: "secret",
      fetch: fetchMock,
    });

    await expect(client.getPageVersion("11")).resolves.toBe(4);
    expect(getFetchCall(fetchMock, 0)[0]).toBe(
      "https://example.invalid/confluence/rest/api/content/11?expand=version",
    );
  });

  test("updates a page with the next version number", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          id: "11",
          version: { number: 4 },
        }),
      )
      .mockResolvedValueOnce(createJsonResponse({ id: "11" }));
    const client = new ConfluenceHttpClient({
      baseUrl: "https://example.invalid/confluence",
      spaceKey: "AAA",
      token: "secret",
      fetch: fetchMock,
    });

    const result = await client.updatePage({
      id: "11",
      title: "Deployment",
      html: "<p>Hello</p>",
      parentId: "901",
    });

    expect(result).toEqual({ ok: true, id: "11" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCall = getFetchCall(fetchMock, 1);
    expect(secondCall[0]).toBe(
      "https://example.invalid/confluence/rest/api/content/11",
    );
    expect(secondCall[1]).toMatchObject({
      method: "PUT",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(secondCall[1]?.body))).toEqual({
      id: "11",
      type: "page",
      title: "Deployment",
      space: { key: "AAA" },
      ancestors: [{ id: "901" }],
      version: { number: 5 },
      body: {
        storage: {
          value: "<p>Hello</p>",
          representation: "storage",
        },
      },
    });
  });

  test("lists page attachments", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        results: [{ id: "a1", title: "diagram.png", mediaType: "image/png" }],
      }),
    );
    const client = new ConfluenceHttpClient({
      baseUrl: "https://example.invalid/confluence",
      spaceKey: "AAA",
      token: "secret",
      fetch: fetchMock,
    });

    const attachments = await client.listPageAttachments("11");

    expect(attachments).toEqual([
      { id: "a1", title: "diagram.png", mediaType: "image/png" },
    ]);
    expect(getFetchCall(fetchMock, 0)[0]).toBe(
      "https://example.invalid/confluence/rest/api/content/11/child/attachment",
    );
  });

  test("uploads attachment binary data for new attachments", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        results: [{ id: "a1", title: "diagram.png" }],
      }),
    );
    const client = new ConfluenceHttpClient({
      baseUrl: "https://example.invalid/confluence",
      spaceKey: "AAA",
      token: "secret",
      fetch: fetchMock,
    });

    const result = await client.createAttachment({
      pageId: "11",
      filename: "diagram.png",
      contentType: "image/png",
      data: new Uint8Array([1, 2, 3]),
    });

    expect(result).toEqual({ ok: true, id: "a1", title: "diagram.png" });
    const firstCall = getFetchCall(fetchMock, 0);
    expect(firstCall[0]).toBe(
      "https://example.invalid/confluence/rest/api/content/11/child/attachment",
    );
    expect(firstCall[1]).toMatchObject({
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer secret",
        "X-Atlassian-Token": "no-check",
      },
    });
    const body = firstCall[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBeInstanceOf(File);
    expect((body as FormData).get("minorEdit")).toBe("true");
  });

  test("updates existing attachment data", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        results: [{ id: "a1", title: "diagram.png" }],
      }),
    );
    const client = new ConfluenceHttpClient({
      baseUrl: "https://example.invalid/confluence",
      spaceKey: "AAA",
      token: "secret",
      fetch: fetchMock,
    });

    const result = await client.updateAttachment({
      pageId: "11",
      attachmentId: "a1",
      filename: "diagram.png",
      data: new Uint8Array([1, 2, 3]),
    });

    expect(result).toEqual({ ok: true, id: "a1", title: "diagram.png" });
    expect(getFetchCall(fetchMock, 0)[0]).toBe(
      "https://example.invalid/confluence/rest/api/content/11/child/attachment/a1/data",
    );
  });

  test("throws a typed request error for failed lookup calls", async () => {
    const fetchMock = vi.fn(async () =>
      new Response('{"message":"bad"}', {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ConfluenceHttpClient({
      baseUrl: "https://example.invalid/confluence",
      spaceKey: "AAA",
      token: "secret",
      fetch: fetchMock,
    });

    await expect(client.getPagesByTitle("Deployment")).rejects.toEqual(
      expect.objectContaining<Partial<ConfluenceRequestError>>({
        statusCode: "500",
        body: '{"message":"bad"}',
      }),
    );
  });
});
