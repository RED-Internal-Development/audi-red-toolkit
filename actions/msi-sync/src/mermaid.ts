import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, posix } from "node:path";
import { promisify } from "node:util";

import { ActionError } from "../../../packages/action-common/src/errors.js";

const MERMAID_BLOCK_RE = /```mermaid\r?\n([\s\S]*?)```/g;
const execFileAsync = promisify(execFile);

export interface MermaidRenderRequest {
  index: number;
  source: string;
  outputPath: string;
  outputRelativePath: string;
  format: "svg";
}

export interface RenderedMermaidBlock extends MermaidRenderRequest {
  replacementMarkdown: string;
}

export interface RenderMermaidBlocksOptions {
  markdown: string;
  outputDirectory: string;
  outputRelativeDirectory?: string;
  renderer?: MermaidRenderer;
  format?: "svg";
}

export type MermaidRenderer = (
  request: MermaidRenderRequest,
) => Promise<void>;

export function extractMermaidBlocks(markdown: string): string[] {
  return [...markdown.matchAll(MERMAID_BLOCK_RE)].map((match) => match[1] ?? "");
}

export function replaceMermaidBlocks(markdown: string, replacements: string[]): string {
  let index = 0;

  return markdown.replace(MERMAID_BLOCK_RE, () => replacements[index++] ?? "");
}

export async function renderMermaidBlocks(
  options: RenderMermaidBlocksOptions,
): Promise<RenderedMermaidBlock[]> {
  const blocks = extractMermaidBlocks(options.markdown);

  if (blocks.length === 0) {
    return [];
  }

  const format = options.format ?? "svg";
  const outputRelativeDirectory =
    options.outputRelativeDirectory ?? basename(options.outputDirectory);
  const renderer = options.renderer ?? renderMermaidWithMmdc;

  await mkdir(options.outputDirectory, { recursive: true });

  const results: RenderedMermaidBlock[] = [];

  for (const [index, block] of blocks.entries()) {
    const filename = `mermaid-${index + 1}.${format}`;
    const outputPath = join(options.outputDirectory, filename);
    const outputRelativePath = posix.join(outputRelativeDirectory, filename);

    try {
      await renderer({
        index,
        source: block,
        outputPath,
        outputRelativePath,
        format,
      });
      await ensureRenderedOutput(outputPath, index);
    } catch (error) {
      throw wrapMermaidRenderError(error, index);
    }

    results.push({
      index,
      source: block,
      outputPath,
      outputRelativePath,
      format,
      replacementMarkdown: `![Mermaid diagram ${index + 1}](${outputRelativePath})`,
    });
  }

  return results;
}

export async function renderMermaidWithMmdc(
  request: MermaidRenderRequest,
): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), "msi-sync-mermaid-"));
  const inputPath = join(workspace, `mermaid-${request.index + 1}.mmd`);

  try {
    await writeFile(inputPath, request.source, "utf8");
    await execFileAsync("mmdc", ["-i", inputPath, "-o", request.outputPath]);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

async function ensureRenderedOutput(outputPath: string, index: number): Promise<void> {
  const outputStat = await stat(outputPath).catch(() => undefined);

  if (!outputStat?.isFile()) {
    throw new ActionError(
      "MSI_MERMAID_RENDER_FAILED",
      "stage_mermaid",
      `Mermaid block ${index + 1} did not produce an output file at '${outputPath}'.`,
    );
  }
}

function wrapMermaidRenderError(error: unknown, index: number): ActionError {
  if (error instanceof ActionError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const errorCode =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;

  if (errorCode === "ENOENT" || message.includes("ENOENT")) {
    return new ActionError(
      "MSI_MERMAID_RENDER_FAILED",
      "stage_mermaid",
      "Mermaid blocks were found, but 'mmdc' is not available on PATH. Install '@mermaid-js/mermaid-cli' or make 'mmdc' available before running MSI sync.",
    );
  }

  return new ActionError(
    "MSI_MERMAID_RENDER_FAILED",
    "stage_mermaid",
    `Mermaid block ${index + 1} could not be rendered via 'mmdc': ${message}`,
  );
}
