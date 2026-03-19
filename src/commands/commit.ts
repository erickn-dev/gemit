import { execFileSync } from "child_process";
import { createLLM, extractMessageText } from "../llm.js";
import { askConfirmation } from "../prompts.js";
import { getCurrentBranch, getDefaultRemote, getGitStatus, getUpstreamInfo } from "../git.js";
import { failAndExit, ok, section, style, warn, ui, withProgress } from "../ui.js";

function getLLM() {
  try {
    return createLLM();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
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
      console.log(`${ok("OK")} Push completed to ${upstream.fullName}.`);
    } catch {
      failAndExit(`Failed to push to ${upstream.fullName}.`);
    }
    return;
  }

  const remote = getDefaultRemote();
  if (!remote) {
    console.log(`${warn("SKIPPED")} No git remote configured. Push not available.`);
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
    console.log(`${ok("OK")} Push completed and upstream configured (${remote}/${currentBranch}).`);
  } catch {
    failAndExit(`Failed to push "${currentBranch}" to "${remote}".`);
  }
}

export async function generateCommit(): Promise<void> {
  const llm = getLLM();

  const gitInfo = getGitStatus();

  const prompt = `
    Based on this git status/diff, write a commit message using Conventional Commits.
    Return ONLY the commit message in English, with no explanations.

    ${gitInfo}
  `;

  const result = await withProgress("AI is thinking and requesting response...", () => llm.invoke(prompt));
  const message = extractMessageText(result.content);

  if (!message) {
    failAndExit("Failed to generate commit message.");
  }

  section("SUGGESTED COMMIT");
  console.log(style(message, ui.bold));
  console.log();

  const confirmed = await askConfirmation("Commit using this message? (Y/n): ", { defaultYes: true });
  if (!confirmed) {
    console.log(`${warn("CANCELED")} Commit was not created.`);
    return;
  }

  try {
    execFileSync("git", ["commit", "-m", message], { stdio: "inherit" });
  } catch {
    failAndExit("Failed to create commit. Check if you have staged files.");
  }

  await maybePushCurrentBranch();
}
