import { describe, expect, test } from "vitest";

import {
  renderDirectoryTitleHtml,
  renderMarkdownToHtml,
  stripFrontmatter,
} from "../../actions/msi-sync/src/render.js";

describe("msi-sync render", () => {
  test("strips frontmatter before rendering markdown", async () => {
    const markdown = [
      "---",
      "title: Example",
      "---",
      "# Heading",
      "",
      "Paragraph",
    ].join("\n");

    expect(stripFrontmatter(markdown)).toBe("# Heading\n\nParagraph");
    await expect(renderMarkdownToHtml(markdown)).resolves.toContain(
      "<h1>Heading</h1>",
    );
  });

  test("renders directory titles as escaped HTML", () => {
    expect(renderDirectoryTitleHtml('Deploy <Prod> & "Docs"')).toBe(
      "<h1>Deploy &lt;Prod&gt; &amp; &quot;Docs&quot;</h1>",
    );
  });

  test("normalizes void tags to XHTML-style output for Confluence storage", async () => {
    const markdown = [
      "![Diagram](./diagram.png)",
      "",
      "---",
      "",
      "Line 1  ",
      "Line 2",
    ].join("\n");

    const html = await renderMarkdownToHtml(markdown);

    expect(html).toContain(
      '<img src="./diagram.png" alt="Diagram" width="100%" />',
    );
    expect(html).toContain("<hr />");
    expect(html).toContain("<br />");
  });

  test("preserves explicit image width when one is already present", async () => {
    const html = await renderMarkdownToHtml(
      '<img src="./diagram.png" alt="Diagram" width="50%">',
    );

    expect(html).toContain(
      '<img src="./diagram.png" alt="Diagram" width="50%" />',
    );
  });

  test("keeps explicit self-closing raw html void tags valid", async () => {
    const html = await renderMarkdownToHtml("Alpha<br />Beta<br/>Gamma");

    expect(html).toContain("Alpha<br />Beta<br />Gamma");
    expect(html).not.toContain("<br / />");
  });

  test("escapes ampersands inside generated attribute values", async () => {
    const html = await renderMarkdownToHtml(
      "Tier 1: http://localhost:3000?market=us&vehicleId=1234567890",
    );

    expect(html).toContain(
      'href="http://localhost:3000?market=us&amp;vehicleId=1234567890"',
    );
  });
});
