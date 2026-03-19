import { basename, dirname, join } from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

export function getCliVersion(): string {
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
