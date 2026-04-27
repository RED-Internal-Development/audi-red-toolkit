const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g;

export function collectAttachmentReferences(markdown: string): string[] {
  const results = new Set<string>();

  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const target = match[1]?.trim();
    if (!target) {
      continue;
    }

    if (target.startsWith("./") || target.startsWith("../")) {
      results.add(target);
    }
  }

  return [...results];
}

export function rewriteAttachmentReferences(
  markdown: string,
  replacements: Map<string, string>,
): string {
  let rewritten = markdown;

  for (const [from, to] of replacements.entries()) {
    rewritten = rewritten.split(`](${from})`).join(`](${to})`);
  }

  return rewritten;
}
