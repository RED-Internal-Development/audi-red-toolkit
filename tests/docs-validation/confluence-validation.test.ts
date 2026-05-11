import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  iterMarkdownFiles,
  validateMarkdownText,
  validatePath,
  validateRenderedHtml,
} from "../../packages/docs-validation/src/confluence-validation.js";

describe("Confluence markdown validation", () => {
  test("detects JSX-style raw HTML attributes", () => {
    const issues = validateMarkdownText(
      [
        "# Coverage",
        "",
        '<div style={{ color: "red" }}>',
        "  flagged",
        "</div>",
      ].join("\n"),
      "coverage.mdx",
    );

    expect(issues).toEqual([
      {
        ruleId: "confluence.jsx_style_attribute",
        filePath: "coverage.mdx",
        message:
          "Raw HTML contains JSX-style attributes such as style={{...}} which MSI Confluence cannot parse.",
      },
    ]);
  });

  test("detects string-based raw HTML style attributes", () => {
    const issues = validateMarkdownText(
      [
        "# Coverage",
        "",
        "<table style='width: 100%'>",
        "  <tr><td>flagged</td></tr>",
        "</table>",
      ].join("\n"),
      "coverage.mdx",
    );

    expect(issues).toEqual([
      {
        ruleId: "confluence.html_string_style_attribute",
        filePath: "coverage.mdx",
        message:
          "Raw HTML contains string-based style attributes like style='...' or style=\"...\". To keep markdown compatible with both Confluence and MDX-based tooling, remove inline styles and use CSS classes instead.",
      },
    ]);
  });

  test("ignores string-style examples inside inline and fenced code", () => {
    const issues = validateMarkdownText(
      [
        "# Clean",
        "",
        "Inline code: `<table style='width: 100%'>`.",
        "",
        "```html",
        '<table style="width: 100%">',
        "  <tr><td>Example</td></tr>",
        "</table>",
        "```",
      ].join("\n"),
      "clean.md",
    );

    expect(issues).toEqual([]);
  });

  test("detects unescaped ampersands inside raw HTML tables", () => {
    const issues = validateMarkdownText(
      ["<table>", "  <tr><td>AT&T</td></tr>", "</table>"].join("\n"),
      "raw-html.mdx",
    );

    expect(issues).toEqual([
      {
        ruleId: "confluence.raw_html_unescaped_ampersand",
        filePath: "raw-html.mdx",
        message:
          "Raw HTML table contains unescaped ampersands; replace '&' with '&amp;' inside raw HTML.",
      },
    ]);
  });

  test("detects malformed rendered self-closing void tags", () => {
    const issues = validateRenderedHtml(
      "<p>Alpha<br / />Beta</p>",
      "rendered.html",
    );

    expect(issues).toEqual([
      {
        ruleId: "confluence.rendered_malformed_void_tag",
        filePath: "rendered.html",
        message:
          "Rendered HTML contains malformed self-closing void tags such as '<br / />', which MSI Confluence rejects as invalid XHTML.",
      },
    ]);
  });

  test("detects rendered attribute values with unescaped ampersands", () => {
    const issues = validateRenderedHtml(
      '<p><a href="http://localhost:3000?market=us&vehicleId=123">link</a></p>',
      "rendered.html",
    );

    expect(issues).toEqual([
      {
        ruleId: "confluence.rendered_attribute_unescaped_ampersand",
        filePath: "rendered.html",
        message:
          "Rendered HTML contains an attribute value with an unescaped '&'. MSI Confluence requires '&amp;' inside XHTML attribute values such as href or src.",
      },
    ]);
  });

  test("ignores examples inside inline and fenced code", () => {
    const issues = validateMarkdownText(
      [
        "# Clean",
        "",
        "Inline code: `style={{example}}`.",
        "",
        "```html",
        "<table>",
        "  <tr><td>AT&T</td></tr>",
        "</table>",
        "```",
      ].join("\n"),
      "clean.md",
    );

    expect(issues).toEqual([]);
  });

  test("does not flag markdown links with query-string ampersands after render normalization", () => {
    const issues = validateMarkdownText(
      "Tier 1: http://localhost:3000?market=us&vehicleId=1234567890",
      "guide.md",
    );

    expect(issues).toEqual([]);
  });

  test("iterates markdown and mdx files in deterministic order", async () => {
    const root = await mkdtemp(join(tmpdir(), "docs-validation-"));

    try {
      await mkdir(join(root, "nested"));
      await writeFile(join(root, "b.mdx"), "# B\n", "utf8");
      await writeFile(join(root, "a.md"), "# A\n", "utf8");
      await writeFile(join(root, "nested", "c.md"), "# C\n", "utf8");
      await writeFile(join(root, "ignore.txt"), "ignore\n", "utf8");

      await expect(iterMarkdownFiles(root)).resolves.toEqual([
        join(root, "a.md"),
        join(root, "b.mdx"),
        join(root, "nested", "c.md"),
      ]);
      await expect(validatePath(root)).resolves.toEqual([]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
