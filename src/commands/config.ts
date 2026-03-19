import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { getGlobalEnvPath } from "../config.js";
import { askConfirmation, askInput } from "../prompts.js";
import { failAndExit, section, ok, warn, bad } from "../ui.js";

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

export type InitConfigOptions = {
  local?: boolean;
};

export async function initConfig(options: InitConfigOptions = {}): Promise<void> {
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

export function doctorConfig(): void {
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
