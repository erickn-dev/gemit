#!/usr/bin/env node

import "dotenv/config";
import { execFileSync, execSync } from "child_process";
import { Command } from "commander";
import { existsSync, writeFileSync } from "fs";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { createLLM, extractMessageText } from "./llm.js";

const ui = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function style(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${ui.reset}`;
}

function divider(): void {
  console.log(style("--------------------------------------------------", ui.dim));
}

function section(title: string): void {
  divider();
  console.log(style(title, ui.bold, ui.cyan));
  divider();
}

function ok(text: string): string {
  return style(text, ui.green, ui.bold);
}

function warn(text: string): string {
  return style(text, ui.yellow, ui.bold);
}

function bad(text: string): string {
  return style(text, ui.red, ui.bold);
}

function failAndExit(message: string): never {
  console.error(`${bad("ERROR")} ${message}`);
  process.exit(1);
}

function getLLM() {
  try {
    return createLLM();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
  }
}

function getGitStatus(): string {
  try {
    const status = execSync("git status").toString();
    const diff = execSync("git diff --stat").toString();
    return `${status}\n${diff}`;
  } catch {
    failAndExit("Not a git repository.");
  }
}

async function askConfirmation(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim().toLowerCase() === "y";
}

async function askInput(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

function branchExists(branchName: string): boolean {
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

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

async function generateCommit(): Promise<void> {
  const llm = getLLM();

  const gitInfo = getGitStatus();

  const prompt = `
    Based on this git status/diff, write a commit message using Conventional Commits.
    Return ONLY the commit message in English, with no explanations.

    ${gitInfo}
  `;

  const result = await llm.invoke(prompt);
  const message = extractMessageText(result.content);

  if (!message) {
    failAndExit("Failed to generate commit message.");
  }

  section("SUGGESTED COMMIT");
  console.log(style(message, ui.bold));
  console.log();

  const confirmed = await askConfirmation("Commit using this message? (y/n): ");
  if (!confirmed) {
    console.log(`${warn("CANCELED")} Commit was not created.`);
    return;
  }

  try {
    execFileSync("git", ["commit", "-m", message], { stdio: "inherit" });
  } catch {
    failAndExit("Failed to create commit. Check if you have staged files.");
  }
}

async function suggestBranch(description: string): Promise<void> {
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

  const result = await llm.invoke(prompt);
  const rawBranch = extractMessageText(result.content);
  const branchName = sanitizeBranchName(rawBranch);

  if (!branchName) {
    failAndExit("Failed to generate branch name.");
  }

  if (branchExists(branchName)) {
    failAndExit(`Branch already exists: ${branchName}`);
  }

  section("SUGGESTED BRANCH");
  console.log(style(branchName, ui.bold));
  console.log();

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

type Provider = "google" | "openai" | "anthropic";

function getProviderKeyName(provider: Provider): "GOOGLE_API_KEY" | "OPENAI_API_KEY" | "ANTHROPIC_API_KEY" {
  if (provider === "google") {
    return "GOOGLE_API_KEY";
  }
  if (provider === "openai") {
    return "OPENAI_API_KEY";
  }
  return "ANTHROPIC_API_KEY";
}

async function initConfig(): Promise<void> {
  const envPath = ".env";
  if (existsSync(envPath)) {
    const overwrite = await askConfirmation(".env already exists. Overwrite? (y/n): ");
    if (!overwrite) {
      console.log("Setup canceled.");
      return;
    }
  }

  const providerInput = await askInput("Provider (google/openai/anthropic) [google]: ");
  const provider = (providerInput || "google").toLowerCase();
  if (provider !== "google" && provider !== "openai" && provider !== "anthropic") {
    failAndExit("Invalid provider. Use google, openai, or anthropic.");
  }

  const providerTyped = provider as Provider;
  const defaultModel =
    providerTyped === "google"
      ? "gemini-2.5-flash"
      : providerTyped === "openai"
        ? "gpt-4o-mini"
        : "claude-3-5-sonnet-latest";
  const model = (await askInput(`Model [${defaultModel}]: `)) || defaultModel;
  const keyName = getProviderKeyName(providerTyped);
  const apiKey = await askInput(`${keyName}: `);

  const envContent = [
    `LLM_PROVIDER="${providerTyped}"`,
    `LLM_MODEL="${model}"`,
    "",
    `GOOGLE_API_KEY="${providerTyped === "google" ? apiKey : ""}"`,
    'GEMINI_API_KEY=""',
    `OPENAI_API_KEY="${providerTyped === "openai" ? apiKey : ""}"`,
    `ANTHROPIC_API_KEY="${providerTyped === "anthropic" ? apiKey : ""}"`,
    "",
  ].join("\n");

  writeFileSync(envPath, envContent, "utf8");
  console.log(`${ok("OK")} Configuration saved to ${envPath}.`);
}

function doctorConfig(): void {
  const provider = (process.env.LLM_PROVIDER || "").toLowerCase();
  const model = process.env.LLM_MODEL || "";
  const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
  const openAiKey = process.env.OPENAI_API_KEY || "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY || "";

  const providerOk = provider === "google" || provider === "openai" || provider === "anthropic";
  const modelOk = Boolean(model);

  const expectedKey =
    provider === "google"
      ? googleKey
      : provider === "openai"
        ? openAiKey
        : provider === "anthropic"
          ? anthropicKey
          : "";
  const expectedKeyName = providerOk ? getProviderKeyName(provider as Provider) : "API_KEY";
  const expectedKeyOk = Boolean(expectedKey);

  section("DIAGNOSTICS");
  console.log(`LLM_PROVIDER   ${providerOk ? ok("ok") : bad("missing/invalid")}`);
  console.log(`LLM_MODEL      ${modelOk ? ok("ok") : bad("missing")}`);
  console.log(`${expectedKeyName.padEnd(14, " ")} ${expectedKeyOk ? ok("ok") : bad("missing")}`);
  console.log(`GOOGLE_API_KEY ${googleKey ? ok("set") : warn("missing")}`);
  console.log(`OPENAI_API_KEY ${openAiKey ? ok("set") : warn("missing")}`);
  console.log(`ANTHROPIC_API_KEY ${anthropicKey ? ok("set") : warn("missing")}`);
  console.log();

  if (!providerOk || !modelOk || !expectedKeyOk) {
    process.exitCode = 1;
  }
}

const program = new Command();

program
  .name("gemit")
  .description(style("Suggest commit messages and branch names with AI", ui.cyan))
  .version("1.0.0");

program.addHelpText(
  "after",
  `
Examples:
  gemit
  gemit commit
  gemit branch "oauth login screen"
  gemit init
  gemit doctor
`
);

program.command("commit").description("Suggest a commit message and optionally commit").action(generateCommit);

program
  .command("branch")
  .description("Suggest a branch name and optionally create the branch")
  .argument("<description...>", "Feature description")
  .action(async (parts: string[]) => {
    const description = parts.join(" ").trim();
    if (!description) {
      failAndExit("Provide a feature description.");
    }
    await suggestBranch(description);
  });

program
  .command("init")
  .description("Configure provider, model, and API key in .env")
  .action(initConfig);

program
  .command("doctor")
  .description("Validate provider, model, and key configuration")
  .action(doctorConfig);

if (process.argv.length <= 2) {
  generateCommit().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
  });
} else {
  program.parseAsync(process.argv).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
  });
}
