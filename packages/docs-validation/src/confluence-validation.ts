import { marked } from "marked";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const MARKDOWN_SUFFIXES = new Set([".md", ".mdx"]);
const FENCE_RE = /^[ \t]{0,3}(```+|~~~+)/;
const INLINE_CODE_RE = /(`+)(.+?)\1/g;
const JSX_STYLE_RE = /style\s*=\s*\{\{/i;
const HTML_STRING_STYLE_RE = /(?:^|\s)style\s*=\s*["']/i;
const TABLE_START_RE = /<table\b/i;
const TABLE_END_RE = /<\/table\b/i;
const UNESCAPED_AMP_RE = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9A-Fa-f]+;)/;
const VOID_ELEMENT_RE =
  /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b([^<>]*?)\/?>/gi;
const MALFORMED_SELF_CLOSING_VOID_RE =
  /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b[^<>]*\/\s*\/\s*>/i;
const ATTRIBUTE_RE = /\b[a-zA-Z_:][\w:.-]*\s*=\s*("([^"]*)"|'([^']*)')/g;
const ATTRIBUTE_VALUE_RE = /(=\s*")([^"]*)(")|(=\s*')([^']*)(')/g;

export interface ValidationIssue {
  ruleId: string;
  filePath: string;
  message: string;
}

export async function iterMarkdownFiles(root: string): Promise<string[]> {
  const rootStat = await stat(root).catch(() => undefined);

  if (!rootStat) {
    return [];
  }

  if (rootStat.isFile()) {
    return isMarkdownFile(root) ? [root] : [];
  }

  if (!rootStat.isDirectory()) {
    return [];
  }

  const results: string[] = [];
  await collectMarkdownFiles(root, results);
  return results.sort((left, right) => left.localeCompare(right));
}

export function validateMarkdownText(
  text: string,
  filePath: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let foundJsxStyle = false;
  let foundHtmlStringStyle = false;
  let foundUnescapedAmpersand = false;
  let inFencedCodeBlock = false;
  let inRawHtmlTable = false;

  for (const line of text.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) {
      inFencedCodeBlock = !inFencedCodeBlock;
      continue;
    }

    if (inFencedCodeBlock) {
      continue;
    }

    const searchableLine = stripInlineCode(line);

    if (!foundJsxStyle && JSX_STYLE_RE.test(searchableLine)) {
      issues.push({
        ruleId: "confluence.jsx_style_attribute",
        filePath,
        message:
          "Raw HTML contains JSX-style attributes such as style={{...}} which MSI Confluence cannot parse.",
      });
      foundJsxStyle = true;
    }

    if (!foundHtmlStringStyle && HTML_STRING_STYLE_RE.test(searchableLine)) {
      issues.push({
        ruleId: "confluence.html_string_style_attribute",
        filePath,
        message:
          "Raw HTML contains string-based style attributes like style='...' or style=\"...\". To keep markdown compatible with both Confluence and MDX-based tooling, remove inline styles and use CSS classes instead.",
      });
      foundHtmlStringStyle = true;
    }

    if (TABLE_START_RE.test(searchableLine)) {
      inRawHtmlTable = true;
    }

    if (
      inRawHtmlTable &&
      !foundUnescapedAmpersand &&
      UNESCAPED_AMP_RE.test(searchableLine)
    ) {
      issues.push({
        ruleId: "confluence.raw_html_unescaped_ampersand",
        filePath,
        message:
          "Raw HTML table contains unescaped ampersands; replace '&' with '&amp;' inside raw HTML.",
      });
      foundUnescapedAmpersand = true;
    }

    if (TABLE_END_RE.test(searchableLine)) {
      inRawHtmlTable = false;
    }
  }

  const renderedHtml = renderMarkdownPreview(text);
  issues.push(...validateRenderedHtml(renderedHtml, filePath));

  return issues;
}

export function validateRenderedHtml(
  html: string,
  filePath: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (MALFORMED_SELF_CLOSING_VOID_RE.test(html)) {
    issues.push({
      ruleId: "confluence.rendered_malformed_void_tag",
      filePath,
      message:
        "Rendered HTML contains malformed self-closing void tags such as '<br / />', which MSI Confluence rejects as invalid XHTML.",
    });
  }

  ATTRIBUTE_RE.lastIndex = 0;
  let attributeMatch: RegExpExecArray | null;
  while ((attributeMatch = ATTRIBUTE_RE.exec(html)) !== null) {
    const attributeValue = attributeMatch[2] ?? attributeMatch[3] ?? "";
    if (!UNESCAPED_AMP_RE.test(attributeValue)) {
      continue;
    }

    issues.push({
      ruleId: "confluence.rendered_attribute_unescaped_ampersand",
      filePath,
      message:
        "Rendered HTML contains an attribute value with an unescaped '&'. MSI Confluence requires '&amp;' inside XHTML attribute values such as href or src.",
    });
    break;
  }

  return issues;
}

export async function validatePath(root: string): Promise<ValidationIssue[]> {
  const markdownFiles = await iterMarkdownFiles(root);
  const issues: ValidationIssue[] = [];

  for (const markdownFile of markdownFiles) {
    const text = await readFile(markdownFile, "utf8");
    issues.push(...validateMarkdownText(text, markdownFile));
  }

  return issues;
}

function isMarkdownFile(filePath: string): boolean {
  const lowerCasePath = filePath.toLowerCase();
  return [...MARKDOWN_SUFFIXES].some((suffix) =>
    lowerCasePath.endsWith(suffix),
  );
}

async function collectMarkdownFiles(
  directory: string,
  results: string[],
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectMarkdownFiles(entryPath, results);
    } else if (entry.isFile() && isMarkdownFile(entryPath)) {
      results.push(entryPath);
    }
  }
}

function stripInlineCode(line: string): string {
  return line.replace(INLINE_CODE_RE, "");
}

function renderMarkdownPreview(markdown: string): string {
  const html = marked.parse(stripFrontmatter(markdown), {
    async: false,
    gfm: true,
  }) as string;

  return escapeHtmlAttributeAmpersands(normalizeVoidElements(html));
}

function stripFrontmatter(markdown: string): string {
  const lines = markdown.split(/\r?\n/);

  if (lines[0]?.trim() !== "---") {
    return markdown;
  }

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (line === "---" || line === "...") {
      return lines
        .slice(index + 1)
        .join("\n")
        .replace(/^\n+/, "");
    }
  }

  return markdown;
}

function normalizeVoidElements(html: string): string {
  return html.replace(
    VOID_ELEMENT_RE,
    (fullMatch, tagName, attributes = "") => {
      const normalizedTagName = String(tagName).toLowerCase();
      const normalizedAttributes = escapeAttributeAmpersands(
        normalizeAttributeSpacing(
          normalizedTagName === "img"
            ? ensureImageWidth(stripTrailingSelfClosingSlash(attributes))
            : stripTrailingSelfClosingSlash(attributes),
        ),
      );

      if (fullMatch.endsWith("/>")) {
        return `<${normalizedTagName}${normalizedAttributes} />`;
      }

      return `<${normalizedTagName}${normalizedAttributes} />`;
    },
  );
}

function ensureImageWidth(attributes: string): string {
  if (/\swidth\s*=/i.test(attributes)) {
    return attributes;
  }

  return `${attributes} width="100%"`;
}

function stripTrailingSelfClosingSlash(attributes: string): string {
  return attributes.replace(/\s*\/\s*$/, "");
}

function normalizeAttributeSpacing(attributes: string): string {
  const trimmed = attributes.trim();
  return trimmed.length > 0 ? ` ${trimmed}` : "";
}

function escapeAttributeAmpersands(attributes: string): string {
  return escapeHtmlAttributeAmpersands(attributes);
}

function escapeHtmlAttributeAmpersands(html: string): string {
  return html.replace(
    ATTRIBUTE_VALUE_RE,
    (
      fullMatch,
      doublePrefix,
      doubleValue,
      doubleSuffix,
      singlePrefix,
      singleValue,
      singleSuffix,
    ) => {
      if (doublePrefix) {
        return `${doublePrefix}${String(doubleValue).replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9A-Fa-f]+;)/g, "&amp;")}${doubleSuffix}`;
      }

      return `${singlePrefix}${String(singleValue).replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9A-Fa-f]+;)/g, "&amp;")}${singleSuffix}`;
    },
  );
}
