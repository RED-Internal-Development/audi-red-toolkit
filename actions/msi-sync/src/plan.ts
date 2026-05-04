import { readFile, stat } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  resolve,
  sep,
} from "node:path";

import { ActionError } from "../../../packages/action-common/src/errors.js";
import { discoverPublishTree, type DiscoveredFile } from "./discovery.js";
import { getDirectoryPageTitle, getFilePageTitle, resolveAppName } from "./page-titles.js";
import { isDirectoryFileCollision } from "./page-registry.js";

export type PublishPlanPageKind = "directory" | "file-owner" | "nested-file";

export interface PublishPlanParentReference {
  type: "page-id" | "plan-entry";
  value: string;
}

export interface DeploymentRootContext {
  key: string;
  kind: "base" | "deploymentConfig";
  parentPageId: string;
  sourceRoot: string;
  folderPaths: string[];
}

export interface PublishPlanEntry {
  id: string;
  sourcePath: string;
  sourceFilePath?: string;
  relativePath: string;
  appName: string;
  pageTitle: string;
  pageKind: PublishPlanPageKind;
  parent: PublishPlanParentReference;
  deploymentRoot: DeploymentRootContext;
}

export interface PublishPlan {
  sourceRoot: string;
  roots: DeploymentRootContext[];
  entries: PublishPlanEntry[];
  warnings: string[];
}

export interface BuildPublishPlanOptions {
  sourceRoot: string;
  parentPageId: string;
  deploymentConfigPath?: string;
}

interface DeploymentRootDefinition {
  parentPageId: string;
  folderPaths: string[];
}

interface DeploymentConfigResult {
  roots: DeploymentRootDefinition[];
  warnings: string[];
}

interface RootFileSelection {
  file: DiscoveredFile;
  relativePath: string;
}

interface DirectoryContext {
  parentReference: PublishPlanParentReference;
  collisionOwnerFile?: RootFileSelection;
}

export async function buildPublishPlan(
  options: BuildPublishPlanOptions,
): Promise<PublishPlan> {
  const sourceRoot = resolve(options.sourceRoot);
  const publishTree = await discoverPublishTree(sourceRoot);
  const deploymentConfig = await loadDeploymentConfig(options.deploymentConfigPath);

  const roots: DeploymentRootContext[] = [
    {
      key: `base:${options.parentPageId}`,
      kind: "base",
      parentPageId: options.parentPageId,
      sourceRoot,
      folderPaths: [],
    },
    ...deploymentConfig.roots.map((root) => ({
      key: `deployment:${root.parentPageId}`,
      kind: "deploymentConfig" as const,
      parentPageId: root.parentPageId,
      sourceRoot,
      folderPaths: root.folderPaths,
    })),
  ];

  const entries = roots.flatMap((root) => buildEntriesForRoot(root, publishTree.files));

  return {
    sourceRoot,
    roots,
    entries,
    warnings: deploymentConfig.warnings,
  };
}

function buildEntriesForRoot(
  deploymentRoot: DeploymentRootContext,
  sourceFiles: DiscoveredFile[],
): PublishPlanEntry[] {
  const selectedFiles = selectFilesForRoot(deploymentRoot, sourceFiles);
  const directoryPaths = collectDirectoryPaths(selectedFiles);
  const directFilesByDirectory = groupFilesByDirectory(selectedFiles);
  const entries: PublishPlanEntry[] = [];
  const directoryContexts = new Map<string, DirectoryContext>();

  directoryContexts.set("", {
    parentReference: { type: "page-id", value: deploymentRoot.parentPageId },
  });

  for (const directoryPath of directoryPaths) {
    const parentDirectory = getParentDirectory(directoryPath);
    const parentContext = directoryContexts.get(parentDirectory);
    if (!parentContext) {
      throw new ActionError(
        "MSI_INVALID_INPUT",
        "build_publish_plan",
        `Unable to resolve parent directory for '${directoryPath}'.`,
      );
    }

    const directFiles = directFilesByDirectory.get(directoryPath) ?? [];
    const collisionOwnerFile = directFiles.find((file) =>
      isDirectoryFileCollision(basename(directoryPath), basename(file.relativePath)),
    );

    if (collisionOwnerFile) {
      const fileEntry = createFileEntry(
        deploymentRoot,
        collisionOwnerFile,
        parentContext.parentReference,
        "file-owner",
      );
      entries.push(fileEntry);
      directoryContexts.set(directoryPath, {
        parentReference: { type: "plan-entry", value: fileEntry.id },
        collisionOwnerFile,
      });
      continue;
    }

    const sourcePath = join(deploymentRoot.sourceRoot, directoryPath);
    const appName = resolvePlanAppName(deploymentRoot, directoryPath);
    const directoryEntry: PublishPlanEntry = {
      id: `${deploymentRoot.key}:dir:${directoryPath}`,
      sourcePath,
      relativePath: directoryPath,
      appName,
      pageTitle: getDirectoryPageTitle(basename(directoryPath), appName),
      pageKind: "directory",
      parent: parentContext.parentReference,
      deploymentRoot,
    };
    entries.push(directoryEntry);
    directoryContexts.set(directoryPath, {
      parentReference: { type: "plan-entry", value: directoryEntry.id },
    });
  }

  for (const file of selectedFiles) {
    const directoryPath = getParentDirectory(file.relativePath);
    const directoryContext = directoryContexts.get(directoryPath);
    if (!directoryContext) {
      throw new ActionError(
        "MSI_INVALID_INPUT",
        "build_publish_plan",
        `Unable to resolve parent page for '${file.relativePath}'.`,
      );
    }

    if (directoryContext.collisionOwnerFile?.relativePath === file.relativePath) {
      continue;
    }

    entries.push(
      createFileEntry(
        deploymentRoot,
        file,
        directoryContext.parentReference,
        "nested-file",
      ),
    );
  }

  return entries;
}

function createFileEntry(
  deploymentRoot: DeploymentRootContext,
  file: RootFileSelection,
  parent: PublishPlanParentReference,
  pageKind: Extract<PublishPlanPageKind, "file-owner" | "nested-file">,
): PublishPlanEntry {
  const appName = resolvePlanAppName(deploymentRoot, file.relativePath);

  return {
    id: `${deploymentRoot.key}:file:${file.relativePath}`,
    sourcePath: file.file.absolutePath,
    sourceFilePath: file.file.absolutePath,
    relativePath: file.relativePath,
    appName,
    pageTitle: getFilePageTitle(basename(file.relativePath), appName),
    pageKind,
    parent,
    deploymentRoot,
  };
}

function selectFilesForRoot(
  deploymentRoot: DeploymentRootContext,
  sourceFiles: DiscoveredFile[],
): RootFileSelection[] {
  if (deploymentRoot.kind === "base") {
    return sourceFiles.map((file) => ({
      file,
      relativePath: file.relativePath,
    }));
  }

  const selectedFiles = new Map<string, RootFileSelection>();

  for (const folderPath of deploymentRoot.folderPaths) {
    const folderAbsolutePath = join(deploymentRoot.sourceRoot, folderPath);

    if (!existsWithinSourceRoot(deploymentRoot.sourceRoot, folderAbsolutePath)) {
      throw new ActionError(
        "MSI_INVALID_INPUT",
        "validate_inputs",
        `deploymentConfig folder path '${folderPath}' must stay within the source root.`,
      );
    }

    for (const file of sourceFiles) {
      if (!isPathInsideFolder(file.relativePath, folderPath)) {
        continue;
      }

      selectedFiles.set(file.relativePath, {
        file,
        relativePath: file.relativePath,
      });
    }
  }

  return [...selectedFiles.values()].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

function collectDirectoryPaths(files: RootFileSelection[]): string[] {
  const directories = new Set<string>();

  for (const file of files) {
    let current = getParentDirectory(file.relativePath);
    while (current !== "") {
      directories.add(current);
      current = getParentDirectory(current);
    }
  }

  return [...directories].sort((left, right) => {
    const depthDelta = getPathDepth(left) - getPathDepth(right);
    return depthDelta === 0 ? left.localeCompare(right) : depthDelta;
  });
}

function groupFilesByDirectory(
  files: RootFileSelection[],
): Map<string, RootFileSelection[]> {
  const groupedFiles = new Map<string, RootFileSelection[]>();

  for (const file of files) {
    const directoryPath = getParentDirectory(file.relativePath);
    const bucket = groupedFiles.get(directoryPath);
    if (bucket) {
      bucket.push(file);
      continue;
    }

    groupedFiles.set(directoryPath, [file]);
  }

  for (const bucket of groupedFiles.values()) {
    bucket.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  return groupedFiles;
}

async function loadDeploymentConfig(
  deploymentConfigPath: string | undefined,
): Promise<DeploymentConfigResult> {
  if (!deploymentConfigPath) {
    return { roots: [], warnings: [] };
  }

  const resolvedPath = resolve(deploymentConfigPath);
  const configStat = await stat(resolvedPath).catch(() => undefined);

  if (!configStat) {
    return {
      roots: [],
      warnings: [`Deployment config '${deploymentConfigPath}' not found, skipping.`],
    };
  }

  if (!configStat.isFile()) {
    throw new ActionError(
      "MSI_INVALID_INPUT",
      "validate_inputs",
      `deploymentConfig '${deploymentConfigPath}' must reference a JSON file.`,
    );
  }

  const rawConfig = await readFile(resolvedPath, "utf8");
  let parsedConfig: unknown;

  try {
    parsedConfig = JSON.parse(rawConfig);
  } catch (error) {
    throw new ActionError(
      "MSI_INVALID_INPUT",
      "validate_inputs",
      `deploymentConfig '${deploymentConfigPath}' must contain valid JSON: ${getErrorMessage(error)}`,
    );
  }

  if (!isRecord(parsedConfig)) {
    throw new ActionError(
      "MSI_INVALID_INPUT",
      "validate_inputs",
      "deploymentConfig must be a JSON object keyed by parent page id.",
    );
  }

  const roots: DeploymentRootDefinition[] = [];

  for (const [parentPageId, value] of Object.entries(parsedConfig)) {
    if (!isRecord(value)) {
      throw new ActionError(
        "MSI_INVALID_INPUT",
        "validate_inputs",
        `deploymentConfig entry '${parentPageId}' must be an object with folder_paths.`,
      );
    }

    if (!("folder_paths" in value)) {
      throw new ActionError(
        "MSI_INVALID_INPUT",
        "validate_inputs",
        `deploymentConfig entry '${parentPageId}' is missing folder_paths.`,
      );
    }

    const folderPaths = value.folder_paths;
    if (!Array.isArray(folderPaths) || folderPaths.some((path) => typeof path !== "string")) {
      throw new ActionError(
        "MSI_INVALID_INPUT",
        "validate_inputs",
        `deploymentConfig entry '${parentPageId}'.folder_paths must be a string array.`,
      );
    }

    roots.push({
      parentPageId,
      folderPaths: dedupeFolderPaths(folderPaths.map((path) => normalizeFolderPath(path))),
    });
  }

  return { roots, warnings: [] };
}

function dedupeFolderPaths(folderPaths: string[]): string[] {
  return [...new Set(folderPaths)].sort((left, right) => left.localeCompare(right));
}

function normalizeFolderPath(folderPath: string): string {
  const trimmedFolderPath = folderPath.trim();
  if (!trimmedFolderPath) {
    throw new ActionError(
      "MSI_INVALID_INPUT",
      "validate_inputs",
      "deploymentConfig folder_paths entries must not be empty.",
    );
  }

  if (isAbsolute(trimmedFolderPath)) {
    throw new ActionError(
      "MSI_INVALID_INPUT",
      "validate_inputs",
      `deploymentConfig folder path '${folderPath}' must be relative to the source root.`,
    );
  }

  const normalizedFolderPath = normalize(trimmedFolderPath);
  if (
    normalizedFolderPath === ".." ||
    normalizedFolderPath.startsWith(`..${sep}`)
  ) {
    throw new ActionError(
      "MSI_INVALID_INPUT",
      "validate_inputs",
      `deploymentConfig folder path '${folderPath}' must stay within the source root.`,
    );
  }

  return normalizedFolderPath;
}

function resolvePlanAppName(
  deploymentRoot: DeploymentRootContext,
  relativePath: string,
): string {
  const syntheticRoot = deploymentRoot.kind === "base"
    ? deploymentRoot.sourceRoot
    : join(deploymentRoot.sourceRoot, "__deployment__", deploymentRoot.parentPageId);

  return resolveAppName(syntheticRoot, join(syntheticRoot, relativePath));
}

function isPathInsideFolder(relativePath: string, folderPath: string): boolean {
  return relativePath === folderPath || relativePath.startsWith(`${folderPath}${sep}`);
}

function getParentDirectory(relativePath: string): string {
  const parentDirectory = dirname(relativePath);
  return parentDirectory === "." ? "" : parentDirectory;
}

function getPathDepth(relativePath: string): number {
  return relativePath.split(/[\\/]/).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function existsWithinSourceRoot(sourceRoot: string, candidatePath: string): boolean {
  const normalizedSourceRoot = `${normalize(sourceRoot)}${sep}`;
  const normalizedCandidatePath = normalize(candidatePath);
  return normalizedCandidatePath === normalize(sourceRoot) ||
    normalizedCandidatePath.startsWith(normalizedSourceRoot);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
