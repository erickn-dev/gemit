#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./config.js";
import { getCliVersion } from "./cli-version.js";
import { generateCommit } from "./commands/commit.js";
import { addAndCommit } from "./commands/add.js";
import { suggestBranch } from "./commands/branch.js";
import { generatePullRequestText } from "./commands/pr.js";
import { summarizeBranchLog } from "./commands/log.js";
import { generateChangelog } from "./commands/changelog.js";
import { doctorConfig, initConfig } from "./commands/config.js";
import { editPrompt, initPrompts, showPromptContent, showPrompts } from "./commands/prompts.js";
import { maybeAutoUpdate } from "./update.js";
import { failAndExit, style, ui } from "./ui.js";

loadConfig();

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
  gemit commit --all
  gemit commit --check
  gemit add --all
  gemit branch "oauth login screen"
  gemit pr
  gemit log
  gemit changelog
  gemit init
  gemit doctor
  gemit update
  gemit prompts
  gemit prompts --init
  gemit prompts --edit commit
  gemit prompts --show commit
`
);

program
  .command("commit")
  .description("Run stage/summarize/suggest/confirm flow for commits")
  .option("--all", "Stage all changes first (git add .)")
  .option("--check", "Run lint/test (if present) before creating commit")
  .action((options: { all?: boolean; check?: boolean }) => generateCommit(options));

program
  .command("add")
  .description("Stage changes and run commit suggestion flow")
  .option("--all", "Stage all changes first (required)")
  .option("--check", "Run lint/test (if present) before creating commit")
  .action((options: { all?: boolean; check?: boolean }) => addAndCommit(options));

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
  .command("pr")
  .description("Generate PR title and description from branch commits")
  .action(generatePullRequestText);

program.command("log").description("Summarize what was done in the current branch").action(summarizeBranchLog);

program
  .command("changelog")
  .description("Generate a changelog file from commit history")
  .argument("[name]", "Base file name (default: current branch name)")
  .option("-c, --commits <number>", "Number of recent commits to include (default: 20)")
  .action((name: string | undefined, options: { commits?: string }) => generateChangelog(name, options));

program
  .command("init")
  .description("Configure provider, model, and API key (global)")
  .action(initConfig);

program
  .command("doctor")
  .description("Validate provider, model, and key configuration")
  .action(doctorConfig);

program
  .command("update")
  .description("Force a check for updates and install if a new version is available")
  .action(async () => {
    await maybeAutoUpdate(process.argv, true);
  });

program
  .command("prompts")
  .description("Manage AI prompt templates (list, export, customize)")
  .option("--init", "Export built-in prompts to the global config directory and open it")
  .option("--edit <name>", "Open a specific prompt file in your default editor (commit|branch|pr|changelog|log)")
  .option("--show <name>", "Print the built-in template for a specific prompt (commit|branch|pr|changelog|log)")
  .action((options: { init?: boolean; edit?: string; show?: string }) => {
    if (options.init) {
      initPrompts();
    } else if (options.edit) {
      editPrompt(options.edit);
    } else if (options.show) {
      showPromptContent(options.show);
    } else {
      showPrompts();
    }
  });

async function main(): Promise<void> {
  const isUpdateCommand = process.argv.some((arg) => arg === "update");

  if (!isUpdateCommand) {
    await maybeAutoUpdate(process.argv);
  }

  if (process.argv.length <= 2) {
    await generateCommit();
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  failAndExit(message);
});
