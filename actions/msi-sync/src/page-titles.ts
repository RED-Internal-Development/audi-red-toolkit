import { basename, relative, sep } from "node:path";

export function resolveAppName(rootDirectory: string, currentPath: string): string {
  const relativePath = relative(rootDirectory, currentPath);
  const parts = relativePath === "" ? [] : relativePath.split(sep);
  return parts[0] || basename(rootDirectory);
}

export function getDirectoryPageTitle(directoryName: string, appName: string): string {
  return `${directoryName} (${appName})`;
}

export function getFilePageTitle(filename: string, appName: string): string {
  const stem = filename.replace(/\.(md|mdx)$/i, "");
  return `${stem} (${appName})`;
}
