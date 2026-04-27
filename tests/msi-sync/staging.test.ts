import { describe, expect, test } from "vitest";

import {
  collectAttachmentReferences,
  rewriteAttachmentReferences,
} from "../../actions/msi-sync/src/staging.js";
import {
  extractMermaidBlocks,
  replaceMermaidBlocks,
} from "../../actions/msi-sync/src/mermaid.js";

describe("msi-sync staging", () => {
  test("collects only concrete local attachment references", () => {
    const refs = collectAttachmentReferences(
      [
        "![Local](./diagram.png)",
        "![Parent](../images/flow.svg)",
        "![Remote](https://example.com/image.png)",
      ].join("\n"),
    );

    expect(refs).toEqual(["./diagram.png", "../images/flow.svg"]);
  });

  test("rewrites only referenced attachments in staged markdown", () => {
    const rewritten = rewriteAttachmentReferences(
      "![Local](./diagram.png)",
      new Map([["./diagram.png", "staged/diagram.png"]]),
    );

    expect(rewritten).toContain("staged/diagram.png");
  });

  test("extracts and replaces Mermaid blocks deterministically", () => {
    const markdown = ["```mermaid", "graph TD", "A-->B", "```"].join("\n");

    expect(extractMermaidBlocks(markdown)).toEqual(["graph TD\nA-->B\n"]);
    expect(
      replaceMermaidBlocks(markdown, ["![Diagram](diagram-1.svg)"]),
    ).toContain("diagram-1.svg");
  });
});
