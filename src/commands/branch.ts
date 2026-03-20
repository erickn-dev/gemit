import { execFileSync } from "child_process";
import { createLLM, extractMessageText } from "../llm.js";
import { askConfirmation } from "../prompts.js";
import { branchExists, getGitStatus } from "../git.js";
import { failAndExit, printKeyValues, section, warn, withProgress } from "../ui.js";

function sanitizeBranchName(rawName: string): string {
  const normalized = rawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/^-+|-+$/g, "")
    .replace(/^\/+|\/+$/g, "");

  const truncated = normalized.slice(0, 50).replace(/\/+$/g, "").replace(/-+$/g, "");
  const candidate = truncated || "feat/update";

  if (!candidate.includes("/")) {
    return `feat/${candidate}`;
  }

  return candidate;
}

function getLLM() {
  try {
    return createLLM();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
  }
}

export async function suggestBranch(description: string): Promise<void> {
  getGitStatus();
  const llm = getLLM();

  const prompt = `
    Generate a git branch name for the feature described below.
    Rules:
    - Format: <type>/<kebab-case-description>
    - Allowed types: feat, fix, chore, docs, refactor, test
    - Maximum length: 50 characters
    - Return ONLY the branch name in English

    Description:
    ${description}
  `;

  const result = await withProgress("AI is thinking and requesting response...", () => llm.invoke(prompt));
  const rawBranch = extractMessageText(result.content);
  const branchName = sanitizeBranchName(rawBranch);

  if (!branchName) {
    failAndExit("Failed to generate branch name.");
  }

  if (branchExists(branchName)) {
    failAndExit(`Branch already exists: ${branchName}`);
  }

  section("SUGGESTED BRANCH");
  printKeyValues([{ key: "Name", value: branchName }]);

  const confirmed = await askConfirmation("Create branch with this name? (y/n): ");
  if (!confirmed) {
    console.log(`${warn("CANCELED")} Branch was not created.`);
    return;
  }

  try {
    execFileSync("git", ["checkout", "-b", branchName], { stdio: "inherit" });
  } catch {
    failAndExit("Failed to create branch.");
  }
}
