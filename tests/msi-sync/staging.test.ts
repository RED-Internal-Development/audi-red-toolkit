import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  collectAttachmentReferences,
  rewriteAttachmentReferences,
  stageMarkdownPage,
} from "../../actions/msi-sync/src/staging.js";
import {
  extractMermaidBlocks,
  renderMermaidBlocks,
  replaceMermaidBlocks,
} from "../../actions/msi-sync/src/mermaid.js";

describe("msi-sync staging", () => {
  let workspaceRoot = "";

  afterEach(async () => {
    if (workspaceRoot) {
      await rm(workspaceRoot, { recursive: true, force: true });
      workspaceRoot = "";
    }
  });

  test("collects only concrete local attachment references", () => {
    const refs = collectAttachmentReferences(
      [
        "![Local](./diagram.png)",
        "![Sibling](images/diagram-2.png)",
        "![Parent](../images/flow.svg)",
        "![Remote](https://example.com/image.png)",
        "![Rooted](/images/skip.png)",
      ].join("\n"),
    );

    expect(refs).toEqual([
      "./diagram.png",
      "images/diagram-2.png",
      "../images/flow.svg",
    ]);
  });

  test("rewrites only referenced attachments in staged markdown", () => {
    const rewritten = rewriteAttachmentReferences(
      "![Local](./diagram.png)",
      new Map([["./diagram.png", "attachments/abcd-diagram.png"]]),
    );

    expect(rewritten).toContain("attachments/abcd-diagram.png");
  });

  test("stages referenced attachments relative to the markdown file directory without mutating the source", async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "msi-sync-staging-"));
    const sourceFile = join(workspaceRoot, "docs", "guide", "README.md");
    const attachment = join(workspaceRoot, "docs", "guide", "images", "diagram.png");
    const stageDirectory = join(workspaceRoot, "stage", "guide");

    await mkdir(dirname(attachment), { recursive: true });
    await mkdir(stageDirectory, { recursive: true });
    await writeFile(
      sourceFile,
      [
        "# Guide",
        "![Diagram](./images/diagram.png)",
        "![Remote](https://example.com/keep.png)",
      ].join("\n"),
      "utf8",
    );
    await writeFile(attachment, "diagram-binary", "utf8");

    const result = await stageMarkdownPage({
      markdownFilePath: sourceFile,
      stageDirectory,
    });

    expect(result.attachments).toHaveLength(1);
    expect(result.attachmentReplacements.get("./images/diagram.png")).toBeDefined();
    expect(result.stagedMarkdown).toContain("attachments/");
    expect(result.stagedMarkdown).toContain("https://example.com/keep.png");
    expect(await readFile(result.attachments[0]!.stagedPath, "utf8")).toBe("diagram-binary");
    expect(await readFile(sourceFile, "utf8")).toContain("![Diagram](./images/diagram.png)");
  });

  test("resolves local attachments from diagrams_source when supplied for compatibility", async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "msi-sync-staging-compat-"));
    const sourceFile = join(workspaceRoot, "docs", "guide", "README.md");
    const diagramsSource = join(workspaceRoot, "legacy-diagrams");
    const legacyAttachment = join(diagramsSource, "deployment.svg");
    const stageDirectory = join(workspaceRoot, "stage", "guide");

    await mkdir(dirname(sourceFile), { recursive: true });
    await mkdir(dirname(legacyAttachment), { recursive: true });
    await mkdir(stageDirectory, { recursive: true });
    await writeFile(sourceFile, "![Deployment](deployment.svg)\n", "utf8");
    await writeFile(legacyAttachment, "<svg>legacy</svg>", "utf8");

    const result = await stageMarkdownPage({
      markdownFilePath: sourceFile,
      diagramsSource,
      stageDirectory,
    });

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]?.sourcePath).toBe(legacyAttachment);
    expect(result.stagedMarkdown).toContain("attachments/");
  });

  test("extracts and replaces Mermaid blocks deterministically", () => {
    const markdown = ["```mermaid", "graph TD", "A-->B", "```"].join("\n");

    expect(extractMermaidBlocks(markdown)).toEqual(["graph TD\nA-->B\n"]);
    expect(
      replaceMermaidBlocks(markdown, ["![Diagram](mermaid/diagram-1.svg)"]),
    ).toContain("mermaid/diagram-1.svg");
  });

  test("renders Mermaid blocks into staged assets and rewrites staged markdown only", async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "msi-sync-mermaid-"));
    const sourceFile = join(workspaceRoot, "docs", "guide", "README.md");
    const stageDirectory = join(workspaceRoot, "stage", "guide");

    await mkdir(dirname(sourceFile), { recursive: true });
    await mkdir(stageDirectory, { recursive: true });
    await writeFile(
      sourceFile,
      ["# Guide", "```mermaid", "graph TD", "A-->B", "```"].join("\n"),
      "utf8",
    );

    const result = await stageMarkdownPage({
      markdownFilePath: sourceFile,
      stageDirectory,
      mermaidRenderer: async ({ outputPath }) => {
        await writeFile(outputPath, "<svg>rendered</svg>", "utf8");
      },
    });

    expect(result.mermaidOutputs).toHaveLength(1);
    expect(result.stagedMarkdown).toContain("![Mermaid diagram 1]");
    expect(await readFile(result.mermaidOutputs[0]!.outputPath, "utf8")).toContain(
      "rendered",
    );
    expect(await readFile(sourceFile, "utf8")).toContain("```mermaid");
  });

  test("fails clearly when Mermaid blocks are present and rendering is unavailable", async () => {
    workspaceRoot = await mkdtemp(join(tmpdir(), "msi-sync-mermaid-fail-"));
    const outputDirectory = join(workspaceRoot, "mermaid");

    await mkdir(outputDirectory, { recursive: true });

    await expect(
      renderMermaidBlocks({
        markdown: ["```mermaid", "graph TD", "A-->B", "```"].join("\n"),
        outputDirectory,
        renderer: async () => {
          const error = new Error("spawn mmdc ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          throw error;
        },
      }),
    ).rejects.toThrow(/mmdc/);
  });
});
