import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const PROMPT_NAMES = ["commit", "branch", "pr", "changelog", "log"] as const;
export type PromptName = (typeof PROMPT_NAMES)[number];

// Available template variables per prompt:
// commit    -> {{detected_type}}, {{staged_files}}, {{summary}}, {{diff_stat}}, {{patch}}
// branch    -> {{description}}
// pr        -> {{branch_data}}
// changelog -> {{commit_limit}}, {{commit_history}}
// log       -> {{branch_context}}

export const DEFAULT_PROMPTS: Record<PromptName, string> = {
  commit: `Write one Conventional Commit message in English based on the staged changes.
Rules:
- Start with this likely type unless evidence strongly suggests another one: {{detected_type}}
- Use format: <type>(optional-scope): <subject>
- Keep subject concise and specific
- Return ONLY the commit message, without code fences or explanations

Staged files:
{{staged_files}}

Short summary:
{{summary}}

Diff stat:
{{diff_stat}}

Patch excerpt:
{{patch}}`,

  branch: `Generate a git branch name for the feature described below.
Rules:
- Format: <type>/<kebab-case-description>
- Allowed types: feat, fix, chore, docs, refactor, test
- Maximum length: 50 characters
- Return ONLY the branch name in English

Description:
{{description}}`,

  pr: `You are generating content for a GitHub Pull Request.
Based on the branch data below, create:
- A concise PR title in English (max 72 chars)
- A clear markdown description with sections: Summary, Changes, Testing

Return exactly in this format:
TITLE: <title>
DESCRIPTION:
<markdown>

Branch data:
{{branch_data}}`,

  changelog: `Crie um CHANGELOG em markdown com base no historico de commits abaixo.
Regras:
- Responda em portugues do Brasil
- Estrutura: titulo, resumo curto e secoes por tipo de mudanca (Features, Fixes, Refactors, Docs, Chore)
- Inclua uma secao "Commits" com lista curta de hashes e assuntos
- Nao invente mudancas

Historico recente de commits (ultimos {{commit_limit}} commits):
{{commit_history}}`,

  log: `Resuma em portugues do Brasil o que foi feito neste branch.
Regras:
- Use linguagem natural e objetiva
- 1 paragrafo curto + lista com bullets das principais mudancas
- Cite impacto tecnico quando possivel
- Nao invente nada fora do contexto fornecido

Contexto do branch:
{{branch_context}}`,
};

export function getPromptsDir(): string {
  if (process.platform === "win32") {
    return join(process.env.APPDATA || join(homedir(), ".gemit"), "gemit", "prompts");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "gemit", "prompts");
  }
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "gemit", "prompts");
}

const LANGUAGE_INSTRUCTIONS: Record<string, Partial<Record<PromptName, string>>> = {
  "pt-br": {
    commit: "\nResponda em português do Brasil.",
    branch: "\nResponda em português do Brasil.",
    pr: "\nResponda em português do Brasil. Título e descrição em português.",
  },
};

// Resolution order: global config dir > built-in default
// If GEMIT_LANGUAGE is set and the prompt doesn't already have language instructions, appends language hint.
export function loadPrompt(name: PromptName): string {
  const dir = getPromptsDir();
  const filePath = join(dir, `${name}.txt`);

  let template: string;
  if (existsSync(filePath)) {
    const content = readFileSync(filePath, "utf8").trim();
    template = content || DEFAULT_PROMPTS[name];
  } else {
    template = DEFAULT_PROMPTS[name];
  }

  const lang = (process.env.GEMIT_LANGUAGE || "en").toLowerCase().trim();
  const langHints = LANGUAGE_INSTRUCTIONS[lang];
  if (langHints?.[name]) {
    template = template + langHints[name];
  }

  return template;
}

// Replaces {{variable_name}} placeholders with the provided values
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

export function initGlobalPrompts(overwrite = false): string[] {
  const dir = getPromptsDir();
  mkdirSync(dir, { recursive: true });

  const created: string[] = [];
  for (const name of PROMPT_NAMES) {
    const filePath = join(dir, `${name}.txt`);
    if (!existsSync(filePath) || overwrite) {
      writeFileSync(filePath, `${DEFAULT_PROMPTS[name]}\n`, "utf8");
      created.push(filePath);
    }
  }

  return created;
}
