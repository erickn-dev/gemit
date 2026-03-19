import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createLLM, extractMessageText } from "../llm.js";
import { getCommitHistory, getCurrentBranch, getGitStatus } from "../git.js";
import { failAndExit, ok, section, withProgress } from "../ui.js";

function getLLM() {
  try {
    return createLLM();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
  }
}

function sanitizeName(raw: string): string {
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "changelog";
}

function formatDateForFile(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function buildCommitHistoryPrompt(): string {
  const commits = getCommitHistory(150);

  if (commits.length === 0) {
    failAndExit("No commits found to generate changelog.");
  }

  return commits
    .map((commit) => {
      const body = commit.body ? ` | body: ${commit.body.replace(/\s+/g, " ").trim()}` : "";
      const date = commit.date || "unknown-date";
      const author = commit.author || "unknown-author";
      return `- ${date} | ${commit.hash.slice(0, 7)} | ${author} | ${commit.subject}${body}`;
    })
    .join("\n");
}

export async function generateChangelog(nameArg?: string): Promise<void> {
  getGitStatus();
  const llm = getLLM();

  const branch = getCurrentBranch();
  const baseName = sanitizeName((nameArg || branch).trim());
  const date = formatDateForFile(new Date());
  const fileName = `${baseName}-${date}.md`;

  const commitHistory = buildCommitHistoryPrompt();

  const prompt = `
Crie um CHANGELOG em markdown com base no historico de commits abaixo.
Regras:
- Responda em portugues do Brasil
- Estrutura: titulo, resumo curto e secoes por tipo de mudanca (Features, Fixes, Refactors, Docs, Chore)
- Inclua uma secao "Commits" com lista curta de hashes e assuntos
- Nao invente mudancas

Historico de commits:
${commitHistory}
`.trim();

  const response = await withProgress("AI is generating changelog...", () => llm.invoke(prompt));
  const changelog = extractMessageText(response.content);

  if (!changelog) {
    failAndExit("Failed to generate changelog content.");
  }

  const outputDir = join(process.cwd(), "changelogs");
  const outputPath = join(outputDir, fileName);

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, `${changelog.trim()}\n`, "utf8");

  section("CHANGELOG GENERATED");
  console.log(`${ok("OK")} File saved: ${outputPath}`);
  console.log();
}
