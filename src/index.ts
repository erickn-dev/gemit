#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./config.js";
import { getCliVersion } from "./cli-version.js";
import { generateCommit } from "./commands/commit.js";
import { suggestBranch } from "./commands/branch.js";
import { doctorConfig, initConfig, type InitConfigOptions } from "./commands/config.js";
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
