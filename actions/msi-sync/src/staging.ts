import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, resolve } from "node:path";

import { ActionError } from "../../../packages/action-common/src/errors.js";
import {
  renderMermaidBlocks,
  replaceMermaidBlocks,
  type MermaidRenderer,
  type RenderedMermaidBlock,
} from "./mermaid.js";

const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(([^)]+)\)/g;
const REMOTE_REFERENCE_RE = /^[a-z][a-z0-9+.-]*:/i;

export interface StagedAttachment {
  sourcePath: string;
  stagedPath: string;
  stagedRelativePath: string;
  originalReference: string;
}

export interface StageMarkdownPageOptions {
  markdownFilePath: string;
  stageDirectory: string;
  diagramsSource?: string;
  mermaidRenderer?: MermaidRenderer;
}

export interface StagedMarkdownPageResult {
  sourceMarkdownPath: string;
  stagedMarkdownPath: string;
  sourceMarkdown: string;
  stagedMarkdown: string;
  attachments: StagedAttachment[];
  mermaidOutputs: RenderedMermaidBlock[];
  attachmentReplacements: Map<string, string>;
  mermaidReplacements: Map<number, string>;
}

export function collectAttachmentReferences(markdown: string): string[] {
  const results = new Set<string>();

  for (const match of markdown.matchAll(MARKDOWN_IMAGE_RE)) {
    const target = normalizeAttachmentReference(match[1]);
    if (!target || !isLocalAttachmentReference(target)) {
      continue;
    }

    results.add(target);
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

export async function stageMarkdownPage(
  options: StageMarkdownPageOptions,
): Promise<StagedMarkdownPageResult> {
  await mkdir(options.stageDirectory, { recursive: true });

  const sourceMarkdown = await readFile(options.markdownFilePath, "utf8");
  const attachmentReferences = collectAttachmentReferences(sourceMarkdown);
  const attachments: StagedAttachment[] = [];
  const attachmentReplacements = new Map<string, string>();

  for (const reference of attachmentReferences) {
    const sourcePath = await resolveAttachmentSource(reference, options);
    const stagedRelativePath = buildStagedAssetRelativePath("attachments", sourcePath, reference);
    const stagedPath = join(options.stageDirectory, ...stagedRelativePath.split("/"));

    await mkdir(dirname(stagedPath), { recursive: true });
    await copyFile(sourcePath, stagedPath);

    attachments.push({
      sourcePath,
      stagedPath,
      stagedRelativePath,
      originalReference: reference,
    });
    attachmentReplacements.set(reference, stagedRelativePath);
  }

  let stagedMarkdown = rewriteAttachmentReferences(sourceMarkdown, attachmentReplacements);

  const mermaidOutputs = await renderMermaidBlocks({
    markdown: stagedMarkdown,
    outputDirectory: join(options.stageDirectory, "mermaid"),
    outputRelativeDirectory: "mermaid",
    renderer: options.mermaidRenderer,
  });
  const mermaidReplacements = new Map(
    mermaidOutputs.map((output) => [output.index, output.replacementMarkdown]),
  );

  if (mermaidOutputs.length > 0) {
    stagedMarkdown = replaceMermaidBlocks(
      stagedMarkdown,
      mermaidOutputs.map((output) => output.replacementMarkdown),
    );
  }

  const stagedMarkdownPath = join(
    options.stageDirectory,
    basename(options.markdownFilePath),
  );
  await writeFile(stagedMarkdownPath, stagedMarkdown, "utf8");

  return {
    sourceMarkdownPath: options.markdownFilePath,
    stagedMarkdownPath,
    sourceMarkdown,
    stagedMarkdown,
    attachments,
    mermaidOutputs,
    attachmentReplacements,
    mermaidReplacements,
  };
}

function normalizeAttachmentReference(reference: string | undefined): string | undefined {
  const normalized = reference?.trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.startsWith("<") && normalized.endsWith(">")) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}

function isLocalAttachmentReference(reference: string): boolean {
  return !reference.startsWith("/") && !reference.startsWith("#") && !REMOTE_REFERENCE_RE.test(reference);
}

async function resolveAttachmentSource(
  reference: string,
  options: StageMarkdownPageOptions,
): Promise<string> {
  const candidates = [
    options.diagramsSource ? resolve(options.diagramsSource, reference) : undefined,
    resolve(dirname(options.markdownFilePath), reference),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const candidateStat = await stat(candidate).catch(() => undefined);
    if (candidateStat?.isFile()) {
      return candidate;
    }
  }

  const searchRoots = [
    options.diagramsSource ? `diagrams_source '${options.diagramsSource}'` : undefined,
    `markdown directory '${dirname(options.markdownFilePath)}'`,
  ]
    .filter(Boolean)
    .join(", ");

  throw new ActionError(
    "MSI_ATTACHMENT_NOT_FOUND",
    "stage_markdown",
    `Attachment reference '${reference}' from '${options.markdownFilePath}' could not be resolved. Checked ${searchRoots}.`,
  );
}

function buildStagedAssetRelativePath(
  directory: string,
  sourcePath: string,
  reference: string,
): string {
  const digest = createHash("sha1")
    .update(`${reference}\0${sourcePath}`)
    .digest("hex")
    .slice(0, 12);

  return posix.join(directory, `${digest}-${basename(sourcePath)}`);
}
