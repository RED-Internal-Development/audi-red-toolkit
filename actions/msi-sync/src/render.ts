import { marked } from "marked";

const VOID_ELEMENT_RE =
  /<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)(\s[^<>]*?)?>/gi;

export function stripFrontmatter(markdown: string): string {
  const lines = markdown.split(/\r?\n/);

  if (lines[0]?.trim() !== "---") {
    return markdown;
  }

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (line === "---" || line === "...") {
      return lines.slice(index + 1).join("\n").replace(/^\n+/, "");
    }
  }

  return markdown;
}

export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  const html = await marked.parse(stripFrontmatter(markdown), {
    async: true,
    gfm: true,
  });

  return normalizeVoidElements(html);
}

export function renderDirectoryTitleHtml(title: string): string {
  return `<h1>${escapeHtml(title)}</h1>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeVoidElements(html: string): string {
  return html.replace(VOID_ELEMENT_RE, (fullMatch, tagName, attributes = "") => {
    if (fullMatch.endsWith("/>")) {
      return fullMatch;
    }

    return `<${String(tagName).toLowerCase()}${attributes} />`;
  });
}
