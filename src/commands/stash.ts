import { execFileSync } from "child_process";
import { createLLM, extractMessageText } from "../llm.js";
import { askConfirmation } from "../prompts.js";
import { failAndExit, ok, printKeyValues, section, style, ui, warn, withProgress } from "../ui.js";

function getLLM() {
  try {
    return createLLM();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
  }
}

const STASH_PROMPT = `Generate a short, descriptive stash message for the changes below.
Rules:
- Be concise (max 60 characters)
- Describe WHAT is being stashed (the work in progress)
- Write in English, present tense
- Return ONLY the message, no quotes, no prefix like "WIP:"

Changed files:
{{files}}

Diff summary:
{{diff}}`;

export async function stashWithMessage(): Promise<void> {
  const llm = getLLM();

  let filesRaw: string;
  let diffRaw: string;

  try {
    filesRaw = execFileSync("git", ["diff", "--name-status", "HEAD"], { stdio: "pipe" }).toString().trim();
  } catch {
    filesRaw = "";
  }

  try {
    const staged = execFileSync("git", ["diff", "--cached", "--name-status"], { stdio: "pipe" }).toString().trim();
    if (staged && filesRaw) {
      filesRaw = `${filesRaw}\n${staged}`;
    } else if (staged) {
      filesRaw = staged;
    }
  } catch {
    // ignore
  }

  if (!filesRaw) {
    failAndExit("No changes to stash. Working tree is clean.");
  }

  try {
    const raw = execFileSync("git", ["diff", "HEAD"], { stdio: "pipe" }).toString().trim();
    diffRaw = raw.length > 8000 ? raw.slice(0, 8000) + "\n(truncated)" : raw;
  } catch {
    diffRaw = "(no diff available)";
  }

  section("STASH");
  const fileLines = filesRaw.split("\n").filter(Boolean);
  printKeyValues([{ key: "Files to stash", value: String(fileLines.length) }]);

  const prompt = STASH_PROMPT
    .replace("{{files}}", filesRaw)
    .replace("{{diff}}", diffRaw);

  const result = await withProgress("AI is generating stash message...", () => llm.invoke(prompt));
  const suggestedMessage = extractMessageText(result.content);

  if (!suggestedMessage) {
    failAndExit("Failed to generate stash message.");
  }

  console.log();
  printKeyValues([{ key: "Stash message", value: style(suggestedMessage, ui.cyan) }]);
  console.log();
  const confirmed = await askConfirmation("Stash changes with this message? (Y/n): ", { defaultYes: true });
  if (!confirmed) {
    console.log(warn("CANCELED", "Stash was not created."));
    return;
  }

  try {
    execFileSync("git", ["stash", "push", "-u", "-m", suggestedMessage], { stdio: "inherit" });
    console.log(ok("STASHED", `Changes saved as: ${suggestedMessage}`));
  } catch {
    failAndExit("Failed to create stash.");
  }
}
