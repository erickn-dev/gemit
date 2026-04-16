import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { getGlobalEnvPath } from "../config.js";
import { askConfirmation, askInput } from "../prompts.js";
import { bad, failAndExit, ok, printKeyValues, section, warn } from "../ui.js";

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

export async function initConfig(): Promise<void> {
  const envPath = getGlobalEnvPath();
  if (existsSync(envPath)) {
    const overwrite = await askConfirmation(`${envPath} already exists. Overwrite? (y/n): `);
    if (!overwrite) {
      console.log(warn("CANCELED", "Setup canceled."));
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

  const langInput = await askInput("Language for AI responses (en/pt-br) [en]: ");
  const language = (langInput || "en").toLowerCase().trim();
  const validLanguages = ["en", "pt-br"];
  if (!validLanguages.includes(language)) {
    failAndExit(`Invalid language "${language}". Use: en or pt-br`);
  }

  const envContent = [
    `LLM_PROVIDER="${providerTyped}"`,
    `LLM_MODEL="${model}"`,
    `GEMIT_LANGUAGE="${language}"`,
    "",
    `GOOGLE_API_KEY="${providerTyped === "google" ? apiKey : ""}"`,
    'GEMINI_API_KEY=""',
    `OPENAI_API_KEY="${providerTyped === "openai" ? apiKey : ""}"`,
    `ANTHROPIC_API_KEY="${providerTyped === "anthropic" ? apiKey : ""}"`,
    "",
  ].join("\n");

  mkdirSync(dirname(envPath), { recursive: true });
  writeFileSync(envPath, envContent, "utf8");
  section("CONFIGURATION SAVED");
  printKeyValues([
    { key: "Status", value: ok("OK") },
    { key: "Path", value: envPath },
    { key: "Language", value: language },
  ]);
}

const ALLOWED_KEYS = ["LLM_PROVIDER", "LLM_MODEL", "GEMIT_LANGUAGE", "GOOGLE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"] as const;
type AllowedKey = (typeof ALLOWED_KEYS)[number];

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function serializeEnvFile(entries: Record<string, string>): string {
  return Object.entries(entries).map(([k, v]) => `${k}="${v}"`).join("\n") + "\n";
}

export function setConfig(keyValue: string): void {
  const eqIndex = keyValue.indexOf("=");
  if (eqIndex < 0) {
    failAndExit(`Invalid format. Use: gemit config --set KEY=value`);
  }

  const key = keyValue.slice(0, eqIndex).trim().toUpperCase();
  const value = keyValue.slice(eqIndex + 1).trim();

  if (!ALLOWED_KEYS.includes(key as AllowedKey)) {
    failAndExit(`Unknown key "${key}". Allowed keys: ${ALLOWED_KEYS.join(", ")}`);
  }

  const envPath = getGlobalEnvPath();
  let entries: Record<string, string> = {};

  if (existsSync(envPath)) {
    entries = parseEnvFile(readFileSync(envPath, "utf8"));
  } else {
    mkdirSync(dirname(envPath), { recursive: true });
  }

  const oldValue = entries[key] ?? "(not set)";
  entries[key] = value;

  writeFileSync(envPath, serializeEnvFile(entries), "utf8");

  section("CONFIG UPDATED");
  printKeyValues([
    { key: "Key", value: key },
    { key: "Old value", value: key.includes("KEY") && oldValue !== "(not set)" ? "***" : oldValue },
    { key: "New value", value: key.includes("KEY") && value ? "***" : value },
    { key: "File", value: envPath },
  ]);
}

export function doctorConfig(): void {
  const globalEnvPath = getGlobalEnvPath();
  const globalExists = existsSync(globalEnvPath);
  const provider = (process.env.LLM_PROVIDER || "").toLowerCase();
  const model = process.env.LLM_MODEL || "";
  const language = process.env.GEMIT_LANGUAGE || "en";
  const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
  const openAiKey = process.env.OPENAI_API_KEY || "";
  const anthropicKey = process.env.ANTHROPIC_API_KEY || "";

  const providerOk = provider === "google" || provider === "openai" || provider === "anthropic";
  const modelOk = Boolean(model);
  const languageOk = language === "en" || language === "pt-br";

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
  printKeyValues([
    { key: "Global .env path", value: globalEnvPath },
    { key: "Global .env", value: globalExists ? ok("found") : warn("missing") },
  ]);
  console.log();
  printKeyValues([
    { key: "LLM_PROVIDER", value: providerOk ? ok("ok") : bad("missing/invalid") },
    { key: "LLM_MODEL", value: modelOk ? ok("ok") : bad("missing") },
    { key: "GEMIT_LANGUAGE", value: languageOk ? ok(language) : warn(`"${language}" (unknown, using "en")`) },
    { key: `Expected (${expectedKeyName})`, value: expectedKeyOk ? ok("ok") : bad("missing") },
    { key: "GOOGLE_API_KEY", value: googleKey ? ok("set") : warn("missing") },
    { key: "OPENAI_API_KEY", value: openAiKey ? ok("set") : warn("missing") },
    { key: "ANTHROPIC_API_KEY", value: anthropicKey ? ok("set") : warn("missing") },
  ]);

  if (!providerOk || !modelOk || !expectedKeyOk) {
    process.exitCode = 1;
  }
}
