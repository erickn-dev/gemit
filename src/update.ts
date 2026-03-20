import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import { dirname, join } from "path";
import { getGlobalEnvPath } from "./config.js";
import { getCliVersion } from "./cli-version.js";
import { bad, ok, warn } from "./ui.js";

const PACKAGE_NAME = "gemit-cli";
const CHECK_INTERVAL_MS = 1000 * 60 * 60 * 12;
const CHECK_TIMEOUT_MS = 2500;
const UPDATE_TIMEOUT_MS = 1000 * 60 * 2;

type UpdateCache = {
  lastCheckedAt?: number;
};

export async function maybeAutoUpdate(argv: string[]): Promise<void> {
  if (process.env.GEMIT_DISABLE_AUTO_UPDATE === "1") {
    return;
  }

  if (!shouldCheckForUpdates(argv)) {
    return;
  }

  const cache = readCache();
  const now = Date.now();
  if (cache.lastCheckedAt && now - cache.lastCheckedAt < CHECK_INTERVAL_MS) {
    return;
  }

  writeCache({ lastCheckedAt: now });

  const latest = await fetchLatestVersion();
  if (!latest) {
    return;
  }

  const current = getCliVersion();
  if (!isVersionLower(current, latest)) {
    return;
  }

  console.log(`${warn("UPDATE")} New version detected (${current} -> ${latest}). Updating gemit...`);
  const updated = await runGlobalUpdate();
  if (updated) {
    console.log(`${ok("UPDATED")} gemit is now on ${latest}.`);
  } else {
    console.log(`${bad("UPDATE FAILED")} Run manually: npm i -g ${PACKAGE_NAME}@latest`);
  }
}

function shouldCheckForUpdates(argv: string[]): boolean {
  if (argv.length <= 2) {
    return true;
  }

  const args = argv.slice(2);
  if (args.includes("-h") || args.includes("--help") || args.includes("-v") || args.includes("--version")) {
    return false;
  }

  const firstCommand = args.find((arg) => !arg.startsWith("-"));
  if (!firstCommand) {
    return false;
  }

  return firstCommand !== "init" && firstCommand !== "doctor";
}

async function fetchLatestVersion(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { version?: string };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function runGlobalUpdate(): Promise<boolean> {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn(npmCommand, ["install", "-g", `${PACKAGE_NAME}@latest`], {
        stdio: "ignore",
      });

      const timer = setTimeout(() => {
        child.kill();
        resolve(false);
      }, UPDATE_TIMEOUT_MS);

      child.on("error", () => {
        clearTimeout(timer);
        resolve(false);
      });

      child.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
    } catch {
      resolve(false);
    }
  });
}

function getCachePath(): string {
  return join(dirname(getGlobalEnvPath()), "update-check.json");
}

function readCache(): UpdateCache {
  try {
    const raw = readFileSync(getCachePath(), "utf8");
    const parsed = JSON.parse(raw) as UpdateCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: UpdateCache): void {
  try {
    const path = getCachePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache), "utf8");
  } catch {
    // Best-effort cache write.
  }
}

function isVersionLower(current: string, latest: string): boolean {
  const currentParts = normalizeVersion(current);
  const latestParts = normalizeVersion(latest);
  if (!currentParts || !latestParts) {
    return false;
  }

  for (let index = 0; index < 3; index += 1) {
    if (currentParts[index] < latestParts[index]) {
      return true;
    }
    if (currentParts[index] > latestParts[index]) {
      return false;
    }
  }

  return false;
}

function normalizeVersion(version: string): [number, number, number] | null {
  const cleaned = version.trim().replace(/^v/i, "").split("-")[0];
  const parts = cleaned.split(".");
  if (parts.length < 3) {
    return null;
  }

  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }

  return [major, minor, patch];
}
