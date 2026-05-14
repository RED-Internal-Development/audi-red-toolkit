import { describe, expect, test, vi } from "vitest";

import { ConfluenceCloudHttpClient } from "../../actions/confluence-cloud-sync/src/confluence-client.js";
import { ConfluenceRequestError } from "../../actions/msi-sync/src/confluence-client.js";

type FetchCall = [string, RequestInit | undefined];

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getFetchCall(
  fetchMock: ReturnType<typeof vi.fn>,
  index: number,
): FetchCall {
  return fetchMock.mock.calls[index] as FetchCall;
}

const BASE_URL = "https://yourorg.atlassian.net";
const EXPECTED_BASIC_AUTH =
  "Basic " + Buffer.from("user@example.com:secret").toString("base64");

describe("confluence-cloud-sync ConfluenceCloudHttpClient", () => {
  test("looks up pages by title with ancestors expanded using Basic auth and /wiki/rest/api base path", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        results: [
          { id: "11", title: "Deployment", ancestors: [{ id: "901" }] },
        ],
      }),
    );
    const client = new ConfluenceCloudHttpClient({
      baseUrl: `${BASE_URL}/`,
      spaceKey: "APPT",
      username: "user@example.com",
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
      `${BASE_URL}/wiki/rest/api/content?spaceKey=APPT&title=Deployment&expand=ancestors&type=page`,
    );
    expect(firstCall[1]).toMatchObject({
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: EXPECTED_BASIC_AUTH,
      },
    });
  });

  test("fetches the current page version via /wiki/rest/api", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        id: "11",
        version: { number: 4 },
      }),
    );
    const client = new ConfluenceCloudHttpClient({
      baseUrl: BASE_URL,
      spaceKey: "APPT",
      username: "user@example.com",
      token: "secret",
      fetch: fetchMock,
    });

    await expect(client.getPageVersion("11")).resolves.toBe(4);
    expect(getFetchCall(fetchMock, 0)[0]).toBe(
      `${BASE_URL}/wiki/rest/api/content/11?expand=version`,
    );
  });

  test("creates a page with Basic auth", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({ id: "99", title: "New Page" }, 201),
    );
    const client = new ConfluenceCloudHttpClient({
      baseUrl: BASE_URL,
      spaceKey: "APPT",
      username: "user@example.com",
      token: "secret",
      fetch: fetchMock,
    });

    const result = await client.createPage({
      title: "New Page",
      html: "<p>Hello</p>",
      parentId: "55",
    });

    expect(result).toEqual({ ok: true, id: "99", title: "New Page" });
    const call = getFetchCall(fetchMock, 0);
    expect(call[0]).toBe(`${BASE_URL}/wiki/rest/api/content`);
    expect(call[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: EXPECTED_BASIC_AUTH,
        "Content-Type": "application/json",
      }),
    });
  });

  test("returns failure result on non-OK create response", async () => {
    const fetchMock = vi.fn(
      async () => new Response("Bad Request", { status: 400 }),
    );
    const client = new ConfluenceCloudHttpClient({
      baseUrl: BASE_URL,
      spaceKey: "APPT",
      username: "user@example.com",
      token: "secret",
      fetch: fetchMock,
    });

    const result = await client.createPage({
      title: "Broken Page",
      html: "<p>fail</p>",
    });

    expect(result).toMatchObject({ ok: false, statusCode: "400" });
  });

  test("throws ConfluenceRequestError on failed GET", async () => {
    const fetchMock = vi.fn(
      async () => new Response("Not Found", { status: 404 }),
    );
    const client = new ConfluenceCloudHttpClient({
      baseUrl: BASE_URL,
      spaceKey: "APPT",
      username: "user@example.com",
      token: "secret",
      fetch: fetchMock,
    });

    await expect(client.getPagesByTitle("Missing")).rejects.toBeInstanceOf(
      ConfluenceRequestError,
    );
  });
});
