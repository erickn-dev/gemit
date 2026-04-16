import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export const PROMPT_NAMES = ["commit", "branch", "pr", "changelog", "log"] as const;
export type PromptName = (typeof PROMPT_NAMES)[number];

// Available template variables per prompt:
// commit    -> {{detected_type}}, {{staged_files}}, {{summary}}, {{diff_stat}}, {{patch}}
// branch    -> {{description}}
// pr        -> {{branch_data}}  (includes commits, changed files, diff stat, code diff)
// changelog -> {{new_version}}, {{from_tag}}, {{commit_count}}, {{range_label}}, {{commit_history}}, {{diff_stat}}
// log       -> {{branch_context}}  (includes commits, changed files, diff stat, code diff)

export const DEFAULT_PROMPTS: Record<PromptName, string> = {
  commit: `You are a senior engineer writing a Conventional Commit message for a GitFlow repository.

Rules:
- Format: <type>(<scope>): <subject>
- Start with "{{detected_type}}" unless the diff clearly indicates a different type:
    feat     – new capability or behavior
    fix      – corrects a bug or regression
    refactor – restructures code without changing behavior
    perf     – improves performance
    test     – adds or corrects tests
    docs     – documentation only
    chore    – build, config, dependencies, tooling
    ci       – CI/CD pipeline changes
    style    – formatting, whitespace (no logic change)
- Scope: derive from the primary module, directory, or domain affected (e.g. auth, api, ui, db)
  Omit scope only when the change is truly cross-cutting
- Subject: imperative mood, lowercase, no trailing period, max 72 chars
  Derive from the actual diff — do not simply echo file names as the subject
- Return ONLY the commit message line, no explanation, no code fences

Staged files:
{{staged_files}}

Short summary:
{{summary}}

Diff stat:
{{diff_stat}}

Patch excerpt:
{{patch}}`,

  branch: `You are naming a Git branch following the GitFlow convention.

Rules:
- Format: <type>/<kebab-case-description>
- GitFlow branch types:
    feature  – new feature to be merged into develop
    bugfix   – bug fix to be merged into develop
    hotfix   – urgent production fix to be merged into main and develop
    release  – release preparation (use only when description mentions a version or release)
    chore    – maintenance, dependency updates, tooling
    docs     – documentation only
    refactor – code restructuring with no behavior change
    test     – tests only
- Description: 2–5 words in kebab-case, specific and meaningful, no filler words (e.g. "add", "update", "do")
- Maximum total length: 50 characters
- Return ONLY the branch name, no explanation

Description:
{{description}}`,

  pr: `You are a senior engineer writing a GitHub Pull Request for a GitFlow repository.

Based on the branch data below, produce a PR title and a markdown body.

Rules:
- Title (max 72 chars): derive from the code diff; treat commit messages as hints only
  Format: <type>: <concise description in imperative mood>
  Detect the branch type from the name prefix (feature/, bugfix/, hotfix/, release/) and reflect it
- Be specific: name the modules, files, or functions most affected
- Prefer evidence from the code diff over commit messages when they conflict
- Do not invent behavior not visible in the diff or commit history
- Testing section: list concrete, verifiable steps — not generic placeholders
- Return ONLY the structure below, no extra commentary

TITLE: <title>
DESCRIPTION:
## Summary
<1–3 sentences on what changed and why>

## Changes
<bulleted list of concrete changes, grouped by area when relevant>

## Testing
<checklist of steps to verify the change>

Branch data:
{{branch_data}}`,

  changelog: `Você é um engenheiro sênior gerando um CHANGELOG profissional em português do Brasil.

Siga o padrão Keep a Changelog (https://keepachangelog.com) adaptado para GitFlow.

CONTEXTO DESTA RELEASE:
- Nova versão: {{new_version}}
- Versão anterior (tag base): {{from_tag}}
- Intervalo analisado: {{range_label}}
- Total de commits neste intervalo: {{commit_count}}

Regras CRÍTICAS:
- Documente APENAS as mudanças contidas nos commits e diff stat abaixo
- NÃO mencione nada que não esteja explicitamente neste intervalo de commits
- Se o número de commits for pequeno, o changelog deve ser pequeno — não invente entradas
- Cabeçalho: ## [{{new_version}}] — use a data do commit mais recente da lista
- Categorias permitidas — inclua apenas as que tiverem entradas reais:
    ### Adicionado    – novas funcionalidades
    ### Alterado      – mudanças em funcionalidades existentes
    ### Corrigido     – correções de bugs
    ### Removido      – funcionalidades removidas
    ### Descontinuado – funcionalidades marcadas para remoção futura
    ### Segurança     – correções de vulnerabilidades
- Cada entrada: frase curta, imperativa, sem ponto final
- Inclua ao final uma seção ### Commits com os hashes curtos, datas e assuntos
- Retorne apenas o markdown, sem explicações adicionais

Commits neste intervalo ({{range_label}}):
{{commit_history}}

Diff stat:
{{diff_stat}}`,

  log: `Você é um engenheiro sênior resumindo o trabalho de um branch GitFlow em português do Brasil.

Regras:
- Identifique o tipo do branch (feature, bugfix, hotfix, release) pelo nome e pelo contexto
- Estrutura obrigatória:
    1. Uma frase de contexto: qual era o objetivo do branch
    2. Parágrafo curto (2–4 frases) descrevendo o que foi implementado
    3. Lista de bullets com as principais mudanças técnicas
- Derive o resumo do diff de código; use as mensagens de commit apenas como complemento
- Cite módulos, arquivos ou funções específicos quando relevante
- Não invente nada fora do contexto fornecido
- Não inclua conclusões genéricas ("o branch está pronto para merge", etc.)

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
