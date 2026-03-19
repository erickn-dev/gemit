#!/usr/bin/env node

import { execFileSync, execSync } from "child_process";
import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";
import { getGlobalEnvPath, loadConfig } from "./config.js";
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

loadConfig();

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

function getCliVersion(): string {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFile);
    const packageJsonPath =
      basename(currentDir) === "dist" || basename(currentDir) === "dist-secure"
        ? join(currentDir, "..", "package.json")
        : join(currentDir, "package.json");
    const content = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(content) as { version?: string };
    return parsed.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function withProgress<T>(message: string, work: () => Promise<T>): Promise<T> {
  if (!process.stdout.isTTY) {
    console.log(message);
    return work();
  }

  const frames = ["|", "/", "-", "\\"];
  let frameIndex = 0;

  const render = () => {
    const frame = frames[frameIndex % frames.length];
    process.stdout.write(`\r${style(frame, ui.cyan)} ${message}`);
    frameIndex += 1;
  };

  render();
  const timer = setInterval(render, 120);

  try {
    const result = await work();
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
    console.log(`${ok("OK")} ${message}`);
    return result;
  } catch (error) {
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
    console.log(`${bad("ERROR")} ${message}`);
    throw error;
  }
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

function getCurrentBranch(): string {
  try {
    const branch = execSync("git branch --show-current", { stdio: "pipe" }).toString().trim();
    if (!branch) {
      failAndExit("Could not detect current branch.");
    }
    return branch;
  } catch {
    failAndExit("Could not detect current branch.");
  }
}

type UpstreamInfo = {
  fullName: string;
  remote: string;
  branch: string;
};

function getUpstreamInfo(): UpstreamInfo | null {
  try {
    const fullName = execSync("git rev-parse --abbrev-ref --symbolic-full-name @{upstream}", {
      stdio: "pipe",
    })
      .toString()
      .trim();
    const slashIndex = fullName.indexOf("/");
    if (slashIndex <= 0) {
      return null;
    }
    return {
      fullName,
      remote: fullName.slice(0, slashIndex),
      branch: fullName.slice(slashIndex + 1),
    };
  } catch {
    return null;
  }
}

function getDefaultRemote(): string | null {
  try {
    const remotes = execSync("git remote", { stdio: "pipe" })
      .toString()
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (remotes.length === 0) {
      return null;
    }
    if (remotes.includes("origin")) {
      return "origin";
    }
    return remotes[0];
  } catch {
    return null;
  }
}

async function maybePushCurrentBranch(): Promise<void> {
  const currentBranch = getCurrentBranch();
  const upstream = getUpstreamInfo();

  if (upstream) {
    const shouldPush = await askConfirmation(
      `Push current branch "${currentBranch}" to "${upstream.fullName}" now? (y/N): `
    );
    if (!shouldPush) {
      return;
    }

    try {
      execFileSync("git", ["push", upstream.remote, `${currentBranch}:${upstream.branch}`], {
        stdio: "inherit",
      });
      console.log(`${ok("OK")} Push completed to ${upstream.fullName}.`);
    } catch {
      failAndExit(`Failed to push to ${upstream.fullName}.`);
    }
    return;
  }

  const remote = getDefaultRemote();
  if (!remote) {
    console.log(`${warn("SKIPPED")} No git remote configured. Push not available.`);
    return;
  }

  const shouldPush = await askConfirmation(
    `No upstream found. Push "${currentBranch}" to "${remote}/${currentBranch}" and set upstream? (y/N): `
  );
  if (!shouldPush) {
    return;
  }

  try {
    execFileSync("git", ["push", "--set-upstream", remote, currentBranch], { stdio: "inherit" });
    console.log(`${ok("OK")} Push completed and upstream configured (${remote}/${currentBranch}).`);
  } catch {
    failAndExit(`Failed to push "${currentBranch}" to "${remote}".`);
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

  const result = await withProgress("AI is thinking and requesting response...", () => llm.invoke(prompt));
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

  await maybePushCurrentBranch();
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

type InitConfigOptions = {
  local?: boolean;
};

async function initConfig(options: InitConfigOptions = {}): Promise<void> {
  const envPath = options.local ? ".env" : getGlobalEnvPath();
  if (existsSync(envPath)) {
    const overwrite = await askConfirmation(`${envPath} already exists. Overwrite? (y/n): `);
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

  mkdirSync(dirname(envPath), { recursive: true });
  writeFileSync(envPath, envContent, "utf8");
  console.log(`${ok("OK")} Configuration saved to ${envPath}.`);
}

function doctorConfig(): void {
  const globalEnvPath = getGlobalEnvPath();
  const localEnvPath = ".env";
  const localExists = existsSync(localEnvPath);
  const globalExists = existsSync(globalEnvPath);
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
  console.log(`Global .env path ${globalEnvPath}`);
  console.log(`Global .env      ${globalExists ? ok("found") : warn("missing")}`);
  console.log(`Local .env       ${localExists ? warn("found (overrides global)") : ok("not found")}`);
  console.log();
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
  .version(getCliVersion(), "-v, --version", "output the version number");

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
  .description("Configure provider, model, and API key (global by default)")
  .option("--local", "Write configuration to local .env in current project")
  .action((options: InitConfigOptions) => initConfig(options));

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
