import { execFileSync } from "child_process";
import { interpolate, loadPrompt } from "../aiPrompts.js";
import { createLLM, extractMessageText } from "../llm.js";
import { askConfirmation } from "../prompts.js";
import {
  getCurrentBranch,
  getDefaultRemote,
  getGitStatus,
  getStagedContext,
  getUpstreamInfo,
  stageAll,
  type StagedContext,
} from "../git.js";
import { failAndExit, info, ok, printKeyValues, printList, section, warn, withProgress } from "../ui.js";

type CommitOptions = {
  all?: boolean;
  check?: boolean;
};

const MAX_PROMPT_PATCH_CHARS = 10000;
const WARN_SPLIT_FILE_COUNT = 10;
const WARN_PROMPT_DIFF_CHARS = 50000;

function getLLM() {
  try {
    return createLLM();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
  }
}

function countByStatus(staged: StagedContext): Record<string, number> {
  const buckets: Record<string, number> = { added: 0, modified: 0, deleted: 0, renamed: 0, other: 0 };
  for (const file of staged.files) {
    if (file.status.startsWith("A")) {
      buckets.added += 1;
      continue;
    }
    if (file.status.startsWith("M")) {
      buckets.modified += 1;
      continue;
    }
    if (file.status.startsWith("D")) {
      buckets.deleted += 1;
      continue;
    }
    if (file.status.startsWith("R")) {
      buckets.renamed += 1;
      continue;
    }
    buckets.other += 1;
  }
  return buckets;
}

function detectCommitType(staged: StagedContext): string {
  const paths = staged.files.map((file) => file.path.toLowerCase());
  const status = countByStatus(staged);

  if (paths.length > 0 && paths.every((path) => /(^|\/)(readme|docs?|changelog)/.test(path) || path.endsWith(".md"))) {
    return "docs";
  }

  if (paths.length > 0 && paths.every((path) => /(^|\/)(test|tests|__tests__|spec)/.test(path) || /\.(spec|test)\./.test(path))) {
    return "test";
  }

  if (status.deleted > 0 && status.added === 0 && status.modified === 0) {
    return "chore";
  }

  if (status.added >= status.modified && status.added > 0) {
    return "feat";
  }

  if (status.modified > 0 && staged.metrics.insertions <= staged.metrics.deletions) {
    return "fix";
  }

  return "refactor";
}

function summarizeChanges(staged: StagedContext): string {
  const status = countByStatus(staged);
  const topFiles = staged.files.slice(0, 3).map((file) => file.path);
  const filesHint =
    staged.files.length > 3 ? `${topFiles.join(", ")} +${staged.files.length - 3} more` : topFiles.join(", ");

  return `${staged.metrics.fileCount} files changed (${status.added} added, ${status.modified} modified, ${status.deleted} deleted, ${status.renamed} renamed), ${staged.metrics.insertions} insertions, ${staged.metrics.deletions} deletions. ${filesHint || "No file paths available."}`;
}

function formatStagedFiles(staged: StagedContext): string {
  return staged.files.map((file) => `- ${file.status} ${file.path}`).join("\n");
}

function runOptionalChecks(): void {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const checks = [
    { label: "lint", args: ["run", "lint", "--if-present"] },
    { label: "test", args: ["run", "test", "--if-present"] },
  ];

  for (const check of checks) {
    console.log(info("CHECK", `Running ${check.label}...`));
    try {
      execFileSync(npmCmd, check.args, { stdio: "inherit" });
      console.log(ok("OK", `${check.label} completed.`));
    } catch {
      failAndExit(`${check.label} failed. Aborting commit.`);
    }
  }
}

async function maybePushCurrentBranch(): Promise<void> {
  const currentBranch = getCurrentBranch();
  const upstream = getUpstreamInfo();

  if (upstream) {
    const shouldPush = await askConfirmation(
      `Push current branch "${currentBranch}" to "${upstream.fullName}" now? (y/N): `
    );
    if (!shouldPush) {
      return;
    }

    try {
      execFileSync("git", ["push", upstream.remote, `${currentBranch}:${upstream.branch}`], {
        stdio: "inherit",
      });
      console.log(ok("OK", `Push completed to ${upstream.fullName}.`));
    } catch {
      failAndExit(`Failed to push to ${upstream.fullName}.`);
    }
    return;
  }

  const remote = getDefaultRemote();
  if (!remote) {
    console.log(warn("SKIPPED", "No git remote configured. Push not available."));
    return;
  }

  const shouldPush = await askConfirmation(
    `No upstream found. Push "${currentBranch}" to "${remote}/${currentBranch}" and set upstream? (y/N): `
  );
  if (!shouldPush) {
    return;
  }

  try {
    execFileSync("git", ["push", "--set-upstream", remote, currentBranch], { stdio: "inherit" });
    console.log(ok("OK", `Push completed and upstream configured (${remote}/${currentBranch}).`));
  } catch {
    failAndExit(`Failed to push "${currentBranch}" to "${remote}".`);
  }
}

export async function generateCommit(options: CommitOptions = {}): Promise<void> {
  const llm = getLLM();

  getGitStatus();

  section("1. STAGE");
  if (options.all) {
    stageAll();
    console.log(ok("OK", "Staged all changes (git add .)."));
  }

  const staged = getStagedContext(MAX_PROMPT_PATCH_CHARS);
  if (staged.files.length === 0) {
    failAndExit("No staged files. Stage changes first or run `gemit commit --all`.");
  }

  if (staged.metrics.fileCount >= WARN_SPLIT_FILE_COUNT) {
    console.log(
      warn("TIP", `${staged.metrics.fileCount} staged files detected. Consider splitting into multiple commits.`)
    );
  }

  printList(
    "Staged files",
    staged.files.map((file) => `${file.status} ${file.path}`)
  );

  if (options.check) {
    console.log();
    runOptionalChecks();
  }

  const summary = summarizeChanges(staged);
  const detectedType = detectCommitType(staged);

  if (staged.metrics.patchChars > WARN_PROMPT_DIFF_CHARS) {
    console.log(
      warn("WARNING", `Large staged diff (${staged.metrics.patchChars} chars). Prompt will include a truncated patch excerpt.`)
    );
  }

  const template = loadPrompt("commit");
  const prompt = interpolate(template, {
    detected_type: detectedType,
    staged_files: formatStagedFiles(staged),
    summary,
    diff_stat: staged.diffStat || "(none)",
    patch: `${staged.patch || "(none)"}${staged.metrics.truncated ? "\n(truncated)" : ""}`,
  });

  section("3. SUGGEST");
  const result = await withProgress("AI is thinking and requesting response...", () => llm.invoke(prompt));
  const suggestedMessage = extractMessageText(result.content);

  if (!suggestedMessage) {
    failAndExit("Failed to generate commit message.");
  }

  printKeyValues([{ key: "Suggested commit", value: suggestedMessage }]);
  const finalMessage = suggestedMessage;
  console.log()
  const confirmed = await askConfirmation("Commit using AI message? (Y/n): ", { defaultYes: true });
  if (!confirmed) {
    console.log(warn("CANCELED", "Commit was not created."));
    return;
  }

  try {
    execFileSync("git", ["commit", "-m", finalMessage], { stdio: "inherit" });
  } catch {
    failAndExit("Failed to create commit. Check if you have staged files.");
  }

  await maybePushCurrentBranch();
}
