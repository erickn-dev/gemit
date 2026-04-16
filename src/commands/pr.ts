import { interpolate, loadPrompt } from "../aiPrompts.js";
import { createLLM, extractMessageText } from "../llm.js";
import { getBranchContext, getCurrentBranch, getGitStatus } from "../git.js";
import { failAndExit, printKeyValues, section, withProgress } from "../ui.js";

type PrSuggestion = {
  title: string;
  description: string;
};

function getLLM() {
  try {
    return createLLM();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
  }
}

function formatCommitsForPrompt(): string {
  const context = getBranchContext();

  if (context.commits.length === 0) {
    failAndExit(`No commits found on current branch against ${context.baseRef}.`, "Make at least one commit before generating a PR description.");
  }

  const commitLines = context.commits.map((commit) => {
    const bodyLine = commit.body ? ` | body: ${commit.body.replace(/\s+/g, " ").trim()}` : "";
    return `- ${commit.hash.slice(0, 7)} | ${commit.subject}${bodyLine}`;
  });

  const patchBlock = context.patch
    ? `${context.patch}${context.patchTruncated ? "\n(truncated)" : ""}`
    : "(none)";

  return [
    `Current branch: ${getCurrentBranch()}`,
    `Base branch: ${context.baseRef}`,
    "",
    "Commits:",
    ...commitLines,
    "",
    "Changed files:",
    context.changedFiles || "(none)",
    "",
    "Diff stat:",
    context.diffStat || "(none)",
    "",
    "Code diff:",
    patchBlock,
  ].join("\n");
}

function parsePrSuggestion(raw: string): PrSuggestion {
  const lines = raw.split(/\r?\n/);
  const titleLine = lines.find((line) => line.toLowerCase().startsWith("title:"));
  const descriptionIndex = lines.findIndex((line) => line.toLowerCase().startsWith("description:"));

  if (!titleLine || descriptionIndex < 0) {
    failAndExit("Failed to parse PR suggestion from AI response.", "The AI returned an unexpected format. Try running the command again.");
  }

  const title = titleLine.slice(titleLine.indexOf(":") + 1).trim();
  const description = lines.slice(descriptionIndex + 1).join("\n").trim();

  if (!title || !description) {
    failAndExit("AI response did not include valid PR title/description.");
  }

  return { title, description };
}

export async function generatePullRequestText(): Promise<void> {
  getGitStatus();
  const llm = getLLM();
  const branchData = formatCommitsForPrompt();

  const template = loadPrompt("pr");
  const prompt = interpolate(template, { branch_data: branchData });

  const response = await withProgress("AI is preparing PR title and description...", () => llm.invoke(prompt));
  const text = extractMessageText(response.content);

  if (!text) {
    failAndExit("Failed to generate PR content.", "Check your API key and network connection, then try again.");
  }

  const pr = parsePrSuggestion(text);

  section("PR TITLE");
  printKeyValues([{ key: "Title", value: pr.title }]);

  section("PR DESCRIPTION");
  console.log(pr.description);
  console.log();
}
