import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { isDirectoryFileCollision } from "./page-registry.js";

export interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
}

export interface PublishTreeCollision {
  directoryPath: string;
  filename: string;
}

export interface PublishTree {
  files: DiscoveredFile[];
  collisions: PublishTreeCollision[];
}

export async function discoverPublishTree(root: string): Promise<PublishTree> {
  const resolvedRoot = resolve(root);
  const files: DiscoveredFile[] = [];
  const collisions: PublishTreeCollision[] = [];

  await walk(resolvedRoot, resolvedRoot, files, collisions);

  return {
    files: files.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    collisions,
  };
}

async function walk(
  root: string,
  current: string,
  files: DiscoveredFile[],
  collisions: PublishTreeCollision[],
): Promise<void> {
  const entries = await readdir(current, { withFileTypes: true });
  const markdownEntries = entries.filter(
    (entry) => entry.isFile() && /\.(md|mdx)$/i.test(entry.name),
  );

  for (const entry of markdownEntries) {
    const absolutePath = join(current, entry.name);
    files.push({
      absolutePath,
      relativePath: relative(root, absolutePath),
    });

    const currentName = current.split(/[\\/]/).pop() ?? "";
    if (isDirectoryFileCollision(currentName, entry.name)) {
      collisions.push({
        directoryPath: relative(root, current),
        filename: entry.name,
      });
    }
  }

  for (const entry of entries.filter((entry) => entry.isDirectory())) {
    await walk(root, join(current, entry.name), files, collisions);
  }
}
