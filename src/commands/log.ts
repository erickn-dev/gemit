import { createLLM, extractMessageText } from "../llm.js";
import { getBranchContext, getCurrentBranch, getGitStatus } from "../git.js";
import { failAndExit, printKeyValues, section, withProgress } from "../ui.js";

function getLLM() {
  try {
    return createLLM();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
  }
}

function formatBranchContextForPrompt(): string {
  const context = getBranchContext();

  if (context.commits.length === 0) {
    failAndExit(`No commits found on current branch against ${context.baseRef}.`);
  }

  const commits = context.commits.map((commit) => {
    const body = commit.body ? ` | body: ${commit.body.replace(/\s+/g, " ").trim()}` : "";
    return `- ${commit.hash.slice(0, 7)} | ${commit.subject}${body}`;
  });

  return [
    `Current branch: ${getCurrentBranch()}`,
    `Base branch: ${context.baseRef}`,
    "",
    "Commits:",
    ...commits,
    "",
    "Changed files:",
    context.changedFiles || "(none)",
    "",
    "Diff stat:",
    context.diffStat || "(none)",
  ].join("\n");
}

export async function summarizeBranchLog(): Promise<void> {
  getGitStatus();
  const llm = getLLM();
  const branchContext = formatBranchContextForPrompt();

  const prompt = `
Resuma em portugues do Brasil o que foi feito neste branch.
Regras:
- Use linguagem natural e objetiva
- 1 paragrafo curto + lista com bullets das principais mudancas
- Cite impacto tecnico quando possivel
- Nao invente nada fora do contexto fornecido

Contexto do branch:
${branchContext}
`.trim();

  const response = await withProgress("AI is summarizing branch work...", () => llm.invoke(prompt));
  const summary = extractMessageText(response.content);

  if (!summary) {
    failAndExit("Failed to generate branch summary.");
  }

  section("BRANCH SUMMARY");
  printKeyValues([{ key: "Branch", value: getCurrentBranch() }]);
  console.log(summary);
  console.log();
}
