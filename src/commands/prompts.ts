import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { DEFAULT_PROMPTS, getPromptsDir, initGlobalPrompts, PROMPT_NAMES } from "../aiPrompts.js";
import { ok, printKeyValues, section, warn } from "../ui.js";

function openDetached(cmd: string, args: string[]): void {
  const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function openInEditor(filePath: string): void {
  if (process.platform === "win32") {
    openDetached("cmd.exe", ["/c", "start", "", filePath]);
  } else if (process.platform === "darwin") {
    openDetached("open", [filePath]);
  } else {
    openDetached("xdg-open", [filePath]);
  }
}

function openDirectory(dirPath: string): void {
  if (process.platform === "win32") {
    openDetached("explorer.exe", [dirPath]);
  } else if (process.platform === "darwin") {
    openDetached("open", [dirPath]);
  } else {
    openDetached("xdg-open", [dirPath]);
  }
}

export function showPrompts(): void {
  const dir = getPromptsDir();

  section("PROMPTS DIRECTORY");
  printKeyValues([{ key: "Path", value: dir }]);

  console.log();
  section("PROMPT STATUS");

  const rows: { key: string; value: string }[] = [];
  for (const name of PROMPT_NAMES) {
    const file = join(dir, `${name}.txt`);
    if (existsSync(file)) {
      rows.push({ key: name, value: ok(`custom → ${file}`) });
    } else {
      rows.push({ key: name, value: warn("built-in default") });
    }
  }
  printKeyValues(rows);

  console.log();
  console.log("Run `gemit prompts --init` to export the defaults to your global config.");
  console.log("Run `gemit prompts --edit <name>` to open a specific prompt in your editor.");
  console.log();
}

export function initPrompts(): void {
  const dir = getPromptsDir();
  const created = initGlobalPrompts();

  section("PROMPTS INITIALIZED");
  printKeyValues([{ key: "Directory", value: dir }]);

  if (created.length > 0) {
    console.log();
    console.log("Created files:");
    for (const file of created) {
      console.log(`  ${file}`);
    }
  } else {
    console.log();
    console.log("All files already exist. Use `gemit prompts --edit <name>` to customize.");
  }

  console.log();
  openDirectory(dir);
}

export function editPrompt(name: string): void {
  if (!PROMPT_NAMES.includes(name as (typeof PROMPT_NAMES)[number])) {
    console.error(`Unknown prompt: "${name}". Valid names: ${PROMPT_NAMES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const dir = getPromptsDir();
  const filePath = join(dir, `${name}.txt`);

  if (!existsSync(filePath)) {
    // Create from default before opening
    initGlobalPrompts();
  }

  section(`EDITING: ${name.toUpperCase()}`);
  printKeyValues([{ key: "File", value: filePath }]);
  console.log();
  openInEditor(filePath);
}

export function showPromptContent(name: string): void {
  if (!PROMPT_NAMES.includes(name as (typeof PROMPT_NAMES)[number])) {
    console.error(`Unknown prompt: "${name}". Valid names: ${PROMPT_NAMES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  section(`PROMPT: ${name.toUpperCase()}`);
  console.log(DEFAULT_PROMPTS[name as (typeof PROMPT_NAMES)[number]]);
  console.log();
}
