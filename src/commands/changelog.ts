import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createLLM, extractMessageText } from "../llm.js";
import { getCommitHistory, getCurrentBranch, getGitStatus } from "../git.js";
import { failAndExit, ok, printKeyValues, section, withProgress } from "../ui.js";

const DEFAULT_COMMIT_LIMIT = 20;
const MAX_COMMIT_LIMIT = 200;

type ChangelogOptions = {
  commits?: string;
};

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

function resolveCommitLimit(options?: ChangelogOptions): number {
  const raw = options?.commits?.trim();
  if (!raw) {
    return DEFAULT_COMMIT_LIMIT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    failAndExit("Invalid --commits value. Use a positive integer.");
  }

  return Math.min(parsed, MAX_COMMIT_LIMIT);
}

function buildCommitHistoryPrompt(limit: number): string {
  const commits = getCommitHistory(limit);

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

export async function generateChangelog(nameArg?: string, options?: ChangelogOptions): Promise<void> {
  getGitStatus();
  const llm = getLLM();
  const commitLimit = resolveCommitLimit(options);

  const branch = getCurrentBranch();
  const baseName = sanitizeName((nameArg || branch).trim());
  const date = formatDateForFile(new Date());
  const fileName = `${baseName}-${date}.md`;

  const commitHistory = buildCommitHistoryPrompt(commitLimit);

  const prompt = `
Crie um CHANGELOG em markdown com base no historico de commits abaixo.
Regras:
- Responda em portugues do Brasil
- Estrutura: titulo, resumo curto e secoes por tipo de mudanca (Features, Fixes, Refactors, Docs, Chore)
- Inclua uma secao "Commits" com lista curta de hashes e assuntos
- Nao invente mudancas

Historico recente de commits (ultimos ${commitLimit} commits):
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
  printKeyValues([
    { key: "Status", value: ok("OK") },
    { key: "File", value: outputPath },
    { key: "Commits used", value: String(commitLimit) },
  ]);
}
