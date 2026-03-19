import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { parse as parseDotenv } from "dotenv";

function getBaseConfigDir(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA || join(homedir(), ".gemit");
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }

  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export function getGlobalEnvPath(): string {
  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "gemit", ".env");
  }

  return join(getBaseConfigDir(), "gemit", ".env");
}

export function loadConfig(): void {
  const globalEnvPath = getGlobalEnvPath();
  loadEnvFile(globalEnvPath, false);

  if (existsSync(".env")) {
    loadEnvFile(".env", true);
  }
}

function loadEnvFile(path: string, override: boolean): void {
  if (!existsSync(path)) {
    return;
  }

  const parsed = parseDotenv(readFileSync(path, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
