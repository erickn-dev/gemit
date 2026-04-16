import { execFileSync } from "child_process";
import { createLLM, extractMessageText } from "../llm.js";
import { getCommitHistory } from "../git.js";
import { askConfirmation } from "../prompts.js";
import { failAndExit, ok, printKeyValues, printList, section, style, ui, warn, withProgress } from "../ui.js";

function getLLM() {
  try {
    return createLLM();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
  }
}

const SQUASH_PROMPT = `Write one Conventional Commit message in English that summarizes all these commits being squashed together.
Rules:
- Use format: <type>(optional-scope): <subject>
- Choose the most representative type from: feat, fix, refactor, chore, docs, test
- Keep subject concise and specific (max 72 chars)
- Return ONLY the commit message, without code fences or explanations

Commits being squashed:
{{commits}}`;

export async function squashCommits(count: number): Promise<void> {
  const llm = getLLM();

  if (!Number.isInteger(count) || count < 2) {
    failAndExit("Number of commits to squash must be an integer >= 2.");
  }

  const history = getCommitHistory(count);

  if (history.length < count) {
    failAndExit(`Only ${history.length} commits available. Cannot squash ${count}.`);
  }

  const commitsToSquash = history.slice(-count);

  section("SQUASH");
  printList(
    `Commits to squash (last ${count})`,
    commitsToSquash.map((c) => `${style(c.hash.slice(0, 7), ui.yellow)}  ${c.subject}`)
  );

  const commitsText = commitsToSquash
    .map((c) => `- ${c.hash.slice(0, 7)} ${c.subject}${c.body ? `\n  ${c.body}` : ""}`)
    .join("\n");

  const prompt = SQUASH_PROMPT.replace("{{commits}}", commitsText);

  const result = await withProgress("AI is generating squash message...", () => llm.invoke(prompt));
  const suggestedMessage = extractMessageText(result.content);

  if (!suggestedMessage) {
    failAndExit("Failed to generate squash message.");
  }

  console.log();
  printKeyValues([{ key: "New message", value: style(suggestedMessage, ui.cyan) }]);
  console.log();
  const confirmed = await askConfirmation(
    `Squash ${count} commits into one with this message? (y/N): `
  );
  if (!confirmed) {
    console.log(warn("CANCELED", "Squash was not performed."));
    return;
  }

  // Soft reset to the commit before the ones being squashed
  try {
    execFileSync("git", ["reset", "--soft", `HEAD~${count}`], { stdio: "pipe" });
  } catch {
    failAndExit(`Failed to reset ${count} commits.`);
  }

  // Re-commit with the new message
  try {
    execFileSync("git", ["commit", "-m", suggestedMessage], { stdio: "inherit" });
    console.log();
    console.log(ok("SQUASHED", `${count} commits merged into: ${suggestedMessage}`));
  } catch {
    failAndExit("Failed to create squashed commit. Attempting to restore...");
  }
}
