import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createLLM, extractMessageText } from "../llm.js";
import { getCommitHistory } from "../git.js";
import { askConfirmation } from "../prompts.js";
import { failAndExit, ok, printKeyValues, section, style, ui, warn, withProgress } from "../ui.js";
import { loadPrompt, interpolate } from "../aiPrompts.js";

function getLLM() {
  try {
    return createLLM();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
  }
}

function readPackageJson(): { version?: string; [key: string]: unknown } | null {
  try {
    if (!existsSync("package.json")) return null;
    return JSON.parse(readFileSync("package.json", "utf8"));
  } catch {
    return null;
  }
}

function updatePackageJsonVersion(newVersion: string): void {
  const pkg = readPackageJson();
  if (!pkg) return;
  pkg.version = newVersion;
  writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

function tagExists(tag: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", `refs/tags/${tag}`], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export async function createRelease(version: string): Promise<void> {
  const llm = getLLM();

  if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    failAndExit(`Invalid version format: "${version}". Use semver like 1.2.3 or 1.2.3-beta.1`);
  }

  const tag = `v${version}`;

  if (tagExists(tag)) {
    failAndExit(`Tag ${tag} already exists. Choose a different version.`);
  }

  section("RELEASE");

  const pkg = readPackageJson();
  const currentVersion = pkg?.version ?? "unknown";

  printKeyValues([
    { key: "Current version", value: style(String(currentVersion), ui.dim) },
    { key: "New version", value: style(version, ui.cyan, ui.bold) },
    { key: "Tag", value: style(tag, ui.yellow) },
    { key: "package.json", value: existsSync("package.json") ? ok("found") : warn("not found") },
  ]);

  const commits = getCommitHistory(30);
  const commitHistory = commits
    .map((c) => `- ${c.hash} ${c.subject}`)
    .join("\n");

  const changelogTemplate = loadPrompt("changelog");
  const changelogPrompt = interpolate(changelogTemplate, {
    commit_limit: "30",
    commit_history: commitHistory || "(no commits)",
  });

  const result = await withProgress("AI is generating changelog...", () => llm.invoke(changelogPrompt));
  const changelog = extractMessageText(result.content);

  if (!changelog) {
    failAndExit("Failed to generate changelog.");
  }

  section("CHANGELOG PREVIEW");
  console.log();
  const previewLines = changelog.split("\n").slice(0, 20);
  for (const line of previewLines) {
    console.log(`  ${style(line, ui.dim)}`);
  }
  if (changelog.split("\n").length > 20) {
    console.log(`  ${style("... (truncated preview)", ui.gray)}`);
  }
  console.log();

  const confirmed = await askConfirmation(
    `Create release ${tag}? This will: update package.json, save changelog, commit, and tag. (y/N): `
  );
  if (!confirmed) {
    console.log(warn("CANCELED", "Release was not created."));
    return;
  }

  // Write changelog file
  const changelogDir = "changelogs";
  mkdirSync(changelogDir, { recursive: true });
  const changelogFile = join(changelogDir, `${tag}.md`);
  writeFileSync(changelogFile, changelog + "\n", "utf8");
  console.log(ok("SAVED", `Changelog written to ${changelogFile}`));

  // Update package.json
  if (pkg) {
    updatePackageJsonVersion(version);
    console.log(ok("UPDATED", `package.json version → ${version}`));
  }

  // Stage files
  const filesToStage = [changelogFile];
  if (pkg) filesToStage.push("package.json");

  try {
    execFileSync("git", ["add", ...filesToStage], { stdio: "pipe" });
  } catch {
    failAndExit("Failed to stage release files.");
  }

  // Commit
  const commitMessage = `chore(release): ${tag}`;
  try {
    execFileSync("git", ["commit", "-m", commitMessage], { stdio: "inherit" });
    console.log(ok("COMMITTED", commitMessage));
  } catch {
    failAndExit("Failed to create release commit.");
  }

  // Tag
  try {
    execFileSync("git", ["tag", "-a", tag, "-m", `Release ${tag}`], { stdio: "inherit" });
    console.log(ok("TAGGED", tag));
  } catch {
    failAndExit(`Failed to create tag ${tag}.`);
  }

  section("RELEASE COMPLETE");
  printKeyValues([
    { key: "Version", value: style(version, ui.cyan, ui.bold) },
    { key: "Tag", value: style(tag, ui.yellow) },
    { key: "Changelog", value: changelogFile },
  ]);
  console.log();
  console.log(`  ${style("→", ui.gray)} Push with: ${style(`git push && git push origin ${tag}`, ui.cyan)}`);
  console.log();
}
