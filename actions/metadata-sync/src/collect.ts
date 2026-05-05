import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { access, readFile } from "node:fs/promises";

import { ActionError } from "../../../packages/action-common/src/errors.js";
import type { MetadataSyncInputs } from "./inputs.js";
import {
  buildMetadataReport,
  parsePackageMetadata,
  type MetadataReport,
  type ReleaseHistoryEntry,
} from "./metadata.js";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
) => Promise<CommandResult>;

export async function collectMetadataReport(
  inputs: MetadataSyncInputs,
  runner: CommandRunner = defaultCommandRunner,
): Promise<MetadataReport> {
  const packageJsonPath = "package.json";
  await ensureFileExists(packageJsonPath);

  const packageJsonText = await readFile(packageJsonPath, "utf8");
  const oneAudiCliText = await readOptionalFile("oneaudi-cli.json");
  const packageMetadata = parsePackageMetadata(
    packageJsonText,
    inputs.repository,
    oneAudiCliText,
  );

  const [dependabotPrs, releaseHistory, publishedVersion, npmAudit] =
    await Promise.all([
      fetchDependabotPullRequests(inputs, runner),
      fetchReleaseHistory(inputs, runner),
      fetchPublishedVersion(inputs, runner),
      runNpmAudit(runner),
    ]);

  return buildMetadataReport({
    packageMetadata,
    publishedVersion,
    releaseHistory,
    dependabotPrs,
    npmAudit,
  });
}

async function ensureFileExists(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new ActionError(
      "METADATA_INVALID_INPUT",
      "validate_inputs",
      `${filePath} is required in the repository root.`,
    );
  }
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return undefined;
  }
}

async function fetchDependabotPullRequests(
  inputs: MetadataSyncInputs,
  runner: CommandRunner,
): Promise<string[]> {
  const result = await safeRun(
    runner,
    "gh",
    [
      "pr",
      "list",
      "--repo",
      inputs.repository,
      "--author",
      "dependabot[bot]",
      "--state",
      "open",
      "--json",
      "title,url,createdAt",
    ],
    { ...process.env, GH_TOKEN: inputs.githubToken },
    "dependabot PR lookup",
    [],
  );

  const parsed = parseJsonArray(result.stdout, []);
  return parsed
    .map((entry) => {
      const title = readString(entry.title);
      const url = readString(entry.url);
      const createdAt = readString(entry.createdAt);

      if (!title || !url || !createdAt) {
        return undefined;
      }

      return `${title} - ${url} - Created at: ${createdAt}`;
    })
    .filter((value): value is string => Boolean(value));
}

async function fetchPublishedVersion(
  inputs: MetadataSyncInputs,
  runner: CommandRunner,
): Promise<string | null> {
  const result = await safeRun(
    runner,
    "gh",
    ["release", "view", "--repo", inputs.repository, "--json", "tagName"],
    { ...process.env, GH_TOKEN: inputs.githubToken },
    "release lookup",
    null,
  );

  if (!result.stdout.trim()) {
    return null;
  }

  const parsed = parseJsonRecord(result.stdout, {});
  return readString(parsed.tagName) ?? null;
}

async function fetchReleaseHistory(
  inputs: MetadataSyncInputs,
  runner: CommandRunner,
): Promise<ReleaseHistoryEntry[]> {
  const result = await safeRun(
    runner,
    "gh",
    ["api", `repos/${inputs.repository}/releases`],
    { ...process.env, GH_TOKEN: inputs.githubToken },
    "release history lookup",
    [],
  );

  const releases = parseJsonArray(result.stdout, []);
  return releases.map((release) => ({
    tag: readString(release.tag_name) ?? null,
    name: readString(release.name) ?? null,
    date: readString(release.published_at) ?? null,
    notes: readString(release.body) ?? null,
  }));
}

async function runNpmAudit(runner: CommandRunner): Promise<unknown> {
  const result = await safeRun(
    runner,
    "npm",
    ["audit", "--json"],
    process.env,
    "npm audit",
    {},
  );

  if (!result.stdout.trim()) {
    return {};
  }

  return parseJsonUnknown(result.stdout, {});
}

async function safeRun<T>(
  runner: CommandRunner,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv | undefined,
  description: string,
  fallback: T,
): Promise<CommandResult> {
  try {
    const result = await runner(command, args, env);
    if (result.exitCode !== 0 && command !== "npm") {
      core.warning(
        `${description} failed with exit code ${result.exitCode}. Continuing with fallback data.`,
      );
      return {
        exitCode: result.exitCode,
        stdout: JSON.stringify(fallback),
        stderr: result.stderr,
      };
    }

    return result;
  } catch (error) {
    core.warning(
      `${description} failed: ${error instanceof Error ? error.message : String(error)}. Continuing with fallback data.`,
    );
    return {
      exitCode: 1,
      stdout: JSON.stringify(fallback),
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

async function defaultCommandRunner(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  const result = await exec.getExecOutput(command, args, {
    env: normalizeEnv(env),
    ignoreReturnCode: true,
    silent: true,
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function normalizeEnv(
  env: NodeJS.ProcessEnv | undefined,
): Record<string, string> | undefined {
  if (!env) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function parseJsonUnknown<T>(text: string, fallback: T): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fallback;
  }
}

function parseJsonRecord(
  text: string,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonArray(
  text: string,
  fallback: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : fallback;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
