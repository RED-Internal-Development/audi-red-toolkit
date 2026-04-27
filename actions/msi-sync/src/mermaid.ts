const MERMAID_BLOCK_RE = /```mermaid\r?\n([\s\S]*?)```/g;

export function extractMermaidBlocks(markdown: string): string[] {
  return [...markdown.matchAll(MERMAID_BLOCK_RE)].map((match) => match[1] ?? "");
}

export function replaceMermaidBlocks(markdown: string, replacements: string[]): string {
  let index = 0;

  return markdown.replace(MERMAID_BLOCK_RE, () => replacements[index++] ?? "");
}
