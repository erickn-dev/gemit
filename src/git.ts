import { execSync } from "child_process";
import { failAndExit } from "./ui.js";

export function getGitStatus(): string {
  try {
    const status = execSync("git status").toString();
    const diff = execSync("git diff --stat").toString();
    return `${status}\n${diff}`;
  } catch {
    failAndExit("Not a git repository.");
  }
}

export function branchExists(branchName: string): boolean {
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

export function getCurrentBranch(): string {
  try {
    const branch = execSync("git branch --show-current", { stdio: "pipe" }).toString().trim();
    if (!branch) {
      failAndExit("Could not detect current branch.");
    }
    return branch;
  } catch {
    failAndExit("Could not detect current branch.");
  }
}

export type UpstreamInfo = {
  fullName: string;
  remote: string;
  branch: string;
};

export function getUpstreamInfo(): UpstreamInfo | null {
  try {
    const fullName = execSync("git rev-parse --abbrev-ref --symbolic-full-name @{upstream}", {
      stdio: "pipe",
    })
      .toString()
      .trim();
    const slashIndex = fullName.indexOf("/");
    if (slashIndex <= 0) {
      return null;
    }
    return {
      fullName,
      remote: fullName.slice(0, slashIndex),
      branch: fullName.slice(slashIndex + 1),
    };
  } catch {
    return null;
  }
}

export function getDefaultRemote(): string | null {
  try {
    const remotes = execSync("git remote", { stdio: "pipe" })
      .toString()
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (remotes.length === 0) {
      return null;
    }
    if (remotes.includes("origin")) {
      return "origin";
    }
    return remotes[0];
  } catch {
    return null;
  }
}
