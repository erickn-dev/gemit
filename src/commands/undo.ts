import { execFileSync } from "child_process";
import { askConfirmation } from "../prompts.js";
import { failAndExit, ok, printKeyValues, section, style, ui, warn } from "../ui.js";

export async function undoLastCommit(): Promise<void> {
  let lastCommitHash: string;
  let lastCommitMessage: string;
  let lastCommitAuthor: string;

  try {
    lastCommitHash = execFileSync("git", ["rev-parse", "--short", "HEAD"], { stdio: "pipe" }).toString().trim();
    lastCommitMessage = execFileSync("git", ["log", "-1", "--pretty=%s"], { stdio: "pipe" }).toString().trim();
    lastCommitAuthor = execFileSync("git", ["log", "-1", "--pretty=%an"], { stdio: "pipe" }).toString().trim();
  } catch {
    failAndExit("Could not read last commit. Make sure there is at least one commit.");
  }

  section("UNDO");
  printKeyValues([
    { key: "Commit", value: style(lastCommitHash, ui.yellow) },
    { key: "Message", value: style(lastCommitMessage, ui.dim) },
    { key: "Author", value: style(lastCommitAuthor, ui.dim) },
    { key: "Action", value: "Soft reset (changes will stay staged)" },
  ]);

  console.log();
  const confirmed = await askConfirmation("Undo this commit? Files will remain staged. (y/N): ");
  if (!confirmed) {
    console.log(warn("CANCELED", "Undo was not performed."));
    return;
  }

  try {
    execFileSync("git", ["reset", "--soft", "HEAD~1"], { stdio: "inherit" });
    console.log();
    console.log(ok("DONE", `Commit ${lastCommitHash} was undone. Changes are now staged.`));
  } catch {
    failAndExit("Failed to undo last commit.");
  }
}
