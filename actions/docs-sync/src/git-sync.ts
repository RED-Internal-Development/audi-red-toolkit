import * as exec from "@actions/exec";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ActionError } from "../../../packages/action-common/src/errors.js";
import type { DocsSyncInputs } from "./inputs.js";

export async function syncDocs(inputs: DocsSyncInputs): Promise<boolean> {
  const cloneDir = await mkdtemp(join(tmpdir(), "docs-sync-"));
  const clonePlan = await resolveClonePlan(inputs, cloneDir);

  try {
    await runGit(["config", "--global", "--add", "safe.directory", process.env.GITHUB_WORKSPACE ?? process.cwd()]);
    await runGit(["config", "--global", "user.email", inputs.userEmail]);
    await runGit(["config", "--global", "user.name", inputs.userName]);

    if (clonePlan.branchExists) {
      await runGit(clonePlan.cloneArgs, {
        code: "DOCSYNC_CLONE_FAILED",
        step: "clone_destination_repo",
        message: `Failed cloning destination repository branch '${inputs.destinationBranch}'.`
      });
    } else {
      await runGit(clonePlan.cloneArgs, {
        code: "DOCSYNC_CLONE_FAILED",
        step: "clone_destination_repo",
        message: "Failed cloning destination repository from main."
      });
      await runGit(clonePlan.checkoutArgs ?? ["checkout", "-b", inputs.destinationBranch], {
        code: "DOCSYNC_BRANCH_CREATE_FAILED",
        step: "clone_destination_repo",
        message: `Failed creating destination branch '${inputs.destinationBranch}'.`
      }, cloneDir);
    }

    await copySource(inputs, cloneDir);
    await runGit(["add", "-A"], { code: "DOCSYNC_GIT_ADD_FAILED", step: "commit_changes", message: "git add failed." }, cloneDir);

    if (!(await hasStagedChanges(cloneDir))) {
      return false;
    }

    const message =
      inputs.commitMessage ??
      `Update from ${inputs.userActor} from this repository https://${inputs.gitServer}/${process.env.GITHUB_REPOSITORY ?? "unknown/repository"}/commit/${process.env.GITHUB_SHA ?? "unknown-sha"}`;

    await runGit(["commit", "--message", message], {
      code: "DOCSYNC_COMMIT_FAILED",
      step: "commit_changes",
      message: "git commit failed."
    }, cloneDir);
    await runGit(["push", "-u", "origin", `HEAD:${inputs.destinationBranch}`], {
      code: "DOCSYNC_PUSH_FAILED",
      step: "push_changes",
      message: "git push failed. Check permissions or branch protection."
    }, cloneDir);

    return true;
  } finally {
    await rm(cloneDir, { force: true, recursive: true });
  }
}

export interface ClonePlan {
  branchExists: boolean;
  cloneArgs: string[];
  checkoutArgs?: string[];
}

export function buildClonePlan(inputs: DocsSyncInputs, cloneDir: string, branchExists: boolean): ClonePlan {
  const repoUrl = `https://x-access-token:${inputs.githubToken}@${inputs.gitServer}/${inputs.destinationRepo}.git`;
  const branchToClone = branchExists ? inputs.destinationBranch : "main";
  const plan: ClonePlan = {
    branchExists,
    cloneArgs: ["clone", "--depth", "1", "--single-branch", "--branch", branchToClone, repoUrl, cloneDir]
  };

  if (!branchExists) {
    plan.checkoutArgs = ["checkout", "-b", inputs.destinationBranch];
  }

  return plan;
}

async function resolveClonePlan(inputs: DocsSyncInputs, cloneDir: string): Promise<ClonePlan> {
  const branchExists = inputs.destinationBranchExists ?? (await detectBranchExists(inputs));
  return buildClonePlan(inputs, cloneDir, branchExists);
}

async function copySource(inputs: DocsSyncInputs, cloneDir: string): Promise<void> {
  const destinationFolder = join(cloneDir, inputs.destinationFolder);
  const destinationPath = inputs.rename ? join(destinationFolder, inputs.rename) : destinationFolder;
  await mkdir(destinationFolder, { recursive: true });

  if (inputs.useRsync) {
    await runCopyCommand("rsync", ["-avrh", "--delete", inputs.sourceFile, destinationPath], "rsync failed while copying source path.");
    return;
  }

  await cp(inputs.sourceFile, destinationPath, {
    recursive: true,
    force: true,
    errorOnExist: false
  }).catch(() => {
    throw new ActionError("DOCSYNC_COPY_FAILED", "copy_source", "Failed copying source path to destination.");
  });
}

async function runCopyCommand(command: string, args: string[], message: string): Promise<void> {
  const exitCode = await exec.exec(command, args, { ignoreReturnCode: true });
  if (exitCode !== 0) {
    throw new ActionError("DOCSYNC_COPY_FAILED", "copy_source", message);
  }
}

async function detectBranchExists(inputs: DocsSyncInputs): Promise<boolean> {
  const repoUrl = `https://x-access-token:${inputs.githubToken}@${inputs.gitServer}/${inputs.destinationRepo}.git`;
  const exitCode = await exec.exec("git", ["ls-remote", "--exit-code", "--heads", repoUrl, inputs.destinationBranch], {
    ignoreReturnCode: true,
    silent: true
  });

  if (exitCode === 0) {
    return true;
  }

  if (exitCode === 2) {
    return false;
  }

  throw new ActionError(
    "DOCSYNC_BRANCH_DETECTION_FAILED",
    "clone_destination_repo",
    `Failed checking whether destination branch '${inputs.destinationBranch}' exists.`
  );
}

async function runGit(
  args: string[],
  failure?: { code: string; step: string; message: string },
  cwd?: string
): Promise<void> {
  const exitCode = await exec.exec("git", args, { cwd, ignoreReturnCode: true });
  if (exitCode !== 0) {
    if (failure) {
      throw new ActionError(failure.code, failure.step, failure.message);
    }
    throw new ActionError("DOCSYNC_GIT_FAILED", "git", `git ${args[0] ?? "command"} failed.`);
  }
}

async function hasStagedChanges(cwd: string): Promise<boolean> {
  const exitCode = await exec.exec("git", ["diff", "--cached", "--quiet", "--exit-code"], {
    cwd,
    ignoreReturnCode: true,
    silent: true
  });

  if (exitCode === 0) {
    return false;
  }

  if (exitCode === 1) {
    return true;
  }

  throw new ActionError("DOCSYNC_GIT_STATUS_FAILED", "commit_changes", "git diff --cached failed.");
}
