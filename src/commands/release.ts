import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createLLM, extractMessageText } from "../llm.js";
import { getCommitsSinceLastRelease, getDefaultRemote } from "../git.js";
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

// ─── Project file handlers ────────────────────────────────────────────────────

interface ProjectFile {
  /** Display label, e.g. "package.json" */
  label: string;
  /** Relative path to the file */
  path: string;
  /** Returns the current version string, or null if undetectable */
  readVersion: () => string | null;
  /** Writes the new version into the file in-place */
  writeVersion: (version: string) => void;
}

// JSON files where `version` is a top-level key (package.json, composer.json)
function jsonProjectFile(path: string): ProjectFile {
  const read = (): Record<string, unknown> | null => {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
  };
  return {
    label: path,
    path,
    readVersion: () => {
      const data = read();
      return typeof data?.version === "string" ? data.version : null;
    },
    writeVersion: (version) => {
      const data = read();
      if (!data) return;
      data.version = version;
      writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
    },
  };
}

// TOML files: Cargo.toml, pyproject.toml
// Matches `version = "x.y.z"` inside a [package] or [project] or [tool.poetry] section.
function tomlProjectFile(path: string, label: string): ProjectFile {
  const read = () => (existsSync(path) ? readFileSync(path, "utf8") : null);
  const VERSION_RE = /^(version\s*=\s*["'])([^"']+)(["'])/m;
  return {
    label,
    path,
    readVersion: () => {
      const content = read();
      if (!content) return null;
      const match = content.match(VERSION_RE);
      return match ? match[2] : null;
    },
    writeVersion: (version) => {
      const content = read();
      if (!content) return;
      if (!VERSION_RE.test(content)) return;
      writeFileSync(path, content.replace(VERSION_RE, `$1${version}$3`), "utf8");
    },
  };
}

// setup.cfg  →  version = x.y.z  (no quotes)
function setupCfgProjectFile(): ProjectFile {
  const path = "setup.cfg";
  const read = () => (existsSync(path) ? readFileSync(path, "utf8") : null);
  const VERSION_RE = /^(version\s*=\s*)(.+)$/m;
  return {
    label: path,
    path,
    readVersion: () => {
      const content = read();
      if (!content) return null;
      const match = content.match(VERSION_RE);
      return match ? match[2].trim() : null;
    },
    writeVersion: (version) => {
      const content = read();
      if (!content) return;
      if (!VERSION_RE.test(content)) return;
      writeFileSync(path, content.replace(VERSION_RE, `$1${version}`), "utf8");
    },
  };
}

// pom.xml  →  first <version>x.y.z</version> that belongs to the root <project>
function pomXmlProjectFile(): ProjectFile {
  const path = "pom.xml";
  const read = () => (existsSync(path) ? readFileSync(path, "utf8") : null);
  // Match the first <version> tag (project-level, before any <dependencies>)
  const VERSION_RE = /(<version>)([^<]+)(<\/version>)/;
  return {
    label: path,
    path,
    readVersion: () => {
      const content = read();
      if (!content) return null;
      const match = content.match(VERSION_RE);
      return match ? match[2].trim() : null;
    },
    writeVersion: (version) => {
      const content = read();
      if (!content) return;
      if (!VERSION_RE.test(content)) return;
      writeFileSync(path, content.replace(VERSION_RE, `$1${version}$3`), "utf8");
    },
  };
}

// pubspec.yaml (Dart/Flutter) →  version: x.y.z
function pubspecYamlProjectFile(): ProjectFile {
  const path = "pubspec.yaml";
  const read = () => (existsSync(path) ? readFileSync(path, "utf8") : null);
  const VERSION_RE = /^(version:\s*)(.+)$/m;
  return {
    label: path,
    path,
    readVersion: () => {
      const content = read();
      if (!content) return null;
      const match = content.match(VERSION_RE);
      return match ? match[2].trim() : null;
    },
    writeVersion: (version) => {
      const content = read();
      if (!content) return;
      if (!VERSION_RE.test(content)) return;
      writeFileSync(path, content.replace(VERSION_RE, `$1${version}`), "utf8");
    },
  };
}

// Returns every project file that actually exists on disk
function detectProjectFiles(): ProjectFile[] {
  const candidates: ProjectFile[] = [
    jsonProjectFile("package.json"),           // Node.js / JavaScript / TypeScript
    jsonProjectFile("composer.json"),          // PHP
    tomlProjectFile("Cargo.toml", "Cargo.toml"),     // Rust
    tomlProjectFile("pyproject.toml", "pyproject.toml"), // Python (Poetry / PEP 517)
    setupCfgProjectFile(),                     // Python (setup.cfg)
    pomXmlProjectFile(),                       // Java / Maven
    pubspecYamlProjectFile(),                  // Dart / Flutter
  ];
  return candidates.filter((f) => existsSync(f.path));
}

// ─── Tag helpers ─────────────────────────────────────────────────────────────

function tagExists(tag: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--verify", `refs/tags/${tag}`], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ─── Main command ─────────────────────────────────────────────────────────────

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

  const projectFiles = detectProjectFiles();
  const currentVersion =
    projectFiles.length > 0 ? (projectFiles[0].readVersion() ?? "unknown") : "unknown";

  const fileStatus =
    projectFiles.length > 0
      ? projectFiles.map((f) => `${f.label} (${f.readVersion() ?? "?"})`).join(", ")
      : warn("none found");

  printKeyValues([
    { key: "Current version", value: style(String(currentVersion), ui.dim) },
    { key: "New version",     value: style(version, ui.cyan, ui.bold) },
    { key: "Tag",             value: style(tag, ui.yellow) },
    { key: "Project files",   value: fileStatus },
  ]);

  const generateChangelog = await askConfirmation(`Generate AI changelog for ${tag}? (y/N): `, { defaultYes: false });

  let changelog: string | null = null;

  if (generateChangelog) {
    const { fromTag, commits, diffStat } = getCommitsSinceLastRelease();
    const rangeLabel = fromTag ? `${fromTag}..HEAD` : "início do repositório..HEAD";
    const commitHistory = commits
      .map((c) => `- ${c.hash} (${c.date}) ${c.subject}`)
      .join("\n");

    const changelogTemplate = loadPrompt("changelog");
    const changelogPrompt = interpolate(changelogTemplate, {
      new_version: version,
      from_tag: fromTag ?? "(nenhuma tag anterior)",
      commit_count: String(commits.length),
      range_label: rangeLabel,
      commit_history: commitHistory || "(nenhum commit novo desde a última release)",
      diff_stat: diffStat || "(sem alterações de arquivos)",
    });

    const result = await withProgress("AI is generating changelog...", () => llm.invoke(changelogPrompt));
    changelog = extractMessageText(result.content);

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
  }

  const filesLabel =
    projectFiles.length > 0
      ? projectFiles.map((f) => f.label).join(", ")
      : "no project file";

  const changelogNote = changelog ? ", save changelog" : "";
  const confirmed = await askConfirmation(
    `Create release ${tag}? This will: update ${filesLabel}${changelogNote}, commit, and tag. (y/N): `
  );
  if (!confirmed) {
    console.log(warn("CANCELED", "Release was not created."));
    return;
  }

  // Write changelog file (only if generated)
  let changelogFile: string | null = null;
  if (changelog) {
    const changelogDir = "changelogs";
    mkdirSync(changelogDir, { recursive: true });
    changelogFile = join(changelogDir, `${tag}.md`);
    writeFileSync(changelogFile, changelog + "\n", "utf8");
    console.log(ok("SAVED", `Changelog written to ${changelogFile}`));
  }

  // Update all detected project files
  for (const f of projectFiles) {
    f.writeVersion(version);
    console.log(ok("UPDATED", `${f.label} version → ${version}`));
  }

  // Stage files
  const filesToStage = [
    ...(changelogFile ? [changelogFile] : []),
    ...projectFiles.map((f) => f.path),
  ];

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
    { key: "Version",   value: style(version, ui.cyan, ui.bold) },
    { key: "Tag",       value: style(tag, ui.yellow) },
    ...(changelogFile ? [{ key: "Changelog", value: changelogFile }] : []),
  ]);
  console.log();

  const shouldPush = await askConfirmation(`Push ${tag} to remote now? (y/N): `);
  if (shouldPush) {
    const remote = getDefaultRemote();
    if (!remote) {
      failAndExit("No remote found. Add a remote and run: git push && git push <remote> " + tag);
      return;
    }
    try {
      console.log();
      execFileSync("git", ["push"], { stdio: "inherit" });
      execFileSync("git", ["push", remote, tag], { stdio: "inherit" });
      console.log();
      console.log(ok("PUSHED", `${tag} and commits sent to remote.`));
    } catch {
      failAndExit(`Push failed. Run manually: git push && git push ${remote} ${tag}`);
    }
  } else {
    const remote = getDefaultRemote() ?? "origin";
    console.log(`  ${style("→", ui.gray)} Push later with: ${style(`git push && git push ${remote} ${tag}`, ui.cyan)}`);
  }
  console.log();
}
