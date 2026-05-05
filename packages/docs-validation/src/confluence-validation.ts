import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const MARKDOWN_SUFFIXES = new Set([".md", ".mdx"]);
const FENCE_RE = /^[ \t]{0,3}(```+|~~~+)/;
const INLINE_CODE_RE = /(`+)(.+?)\1/g;
const JSX_STYLE_RE = /style\s*=\s*\{\{/i;
const HTML_STRING_STYLE_RE = /style\s*=\s*["']/i;
const TABLE_START_RE = /<table\b/i;
const TABLE_END_RE = /<\/table\b/i;
const UNESCAPED_AMP_RE = /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9A-Fa-f]+;)/;

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
          "Raw HTML contains string-based style attributes like style='...' or style=\"...\". Docusaurus interprets HTML in markdown as JSX, which requires style={{...}} objects instead. Convert string styles to inline style objects or move styles to CSS classes.",
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
