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
    await expect(renderMarkdownToHtml(markdown)).resolves.toContain("<h1>Heading</h1>");
  });

  test("renders directory titles as escaped HTML", () => {
    expect(renderDirectoryTitleHtml('Deploy <Prod> & "Docs"')).toBe(
      "<h1>Deploy &lt;Prod&gt; &amp; &quot;Docs&quot;</h1>",
    );
  });

  test("normalizes void tags to XHTML-style output for Confluence storage", async () => {
    const markdown = ["![Diagram](./diagram.png)", "", "---", "", "Line 1  ", "Line 2"].join(
      "\n",
    );

    const html = await renderMarkdownToHtml(markdown);

    expect(html).toContain('<img src="./diagram.png" alt="Diagram" />');
    expect(html).toContain("<hr />");
    expect(html).toContain("<br />");
  });
});
