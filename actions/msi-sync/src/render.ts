import { marked } from "marked";

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
  return await marked.parse(stripFrontmatter(markdown), {
    async: true,
    gfm: true,
  });
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
