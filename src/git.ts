import { execFileSync, execSync } from "child_process";
import { failAndExit } from "./ui.js";

function runGit(args: string[]): string {
  return execFileSync("git", args, { stdio: "pipe" }).toString();
}

export function getGitStatus(): string {
  try {
    const status = runGit(["status"]);
    const diff = runGit(["diff", "--stat"]);
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

export type GitCommit = {
  hash: string;
  subject: string;
  body: string;
  date?: string;
  author?: string;
};

export type BranchContext = {
  baseRef: string;
  mergeBase: string;
  commits: GitCommit[];
  diffStat: string;
  changedFiles: string;
};

function resolveBaseRef(): string {
  const remote = getDefaultRemote();

  if (remote) {
    try {
      const remoteHead = execFileSync(
        "git",
        ["symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`],
        { stdio: "pipe" }
      )
        .toString()
        .trim();
      if (remoteHead) {
        return remoteHead;
      }
    } catch {
      // fall through to local/remote fallback candidates
    }

    for (const candidate of ["main", "master", "develop"]) {
      try {
        execFileSync("git", ["rev-parse", "--verify", `refs/remotes/${remote}/${candidate}`], {
          stdio: "pipe",
        });
        return `${remote}/${candidate}`;
      } catch {
        // keep trying candidates
      }
    }
  }

  for (const candidate of ["main", "master", "develop"]) {
    try {
      execFileSync("git", ["rev-parse", "--verify", `refs/heads/${candidate}`], { stdio: "pipe" });
      return candidate;
    } catch {
      // keep trying candidates
    }
  }

  failAndExit("Could not infer base branch. Set a remote HEAD or create main/master.");
}

function getMergeBase(baseRef: string): string {
  try {
    return execFileSync("git", ["merge-base", baseRef, "HEAD"], { stdio: "pipe" })
      .toString()
      .trim();
  } catch {
    failAndExit(`Could not compute merge-base with ${baseRef}.`);
  }
}

function parseCommits(raw: string): GitCommit[] {
  return raw
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = "", subject = "", body = ""] = entry.split("\x1f");
      return {
        hash: hash.trim(),
        subject: subject.trim(),
        body: body.trim(),
      };
    })
    .filter((commit) => Boolean(commit.hash) && Boolean(commit.subject));
}

export function getBranchContext(): BranchContext {
  const baseRef = resolveBaseRef();
  const mergeBase = getMergeBase(baseRef);

  const commitsRaw = execFileSync(
    "git",
    ["log", "--reverse", "--pretty=format:%H%x1f%s%x1f%b%x1e", `${mergeBase}..HEAD`],
    { stdio: "pipe" }
  )
    .toString()
    .trim();

  const diffStat = execFileSync("git", ["diff", "--stat", `${mergeBase}..HEAD`], { stdio: "pipe" })
    .toString()
    .trim();

  const changedFiles = execFileSync(
    "git",
    ["diff", "--name-status", `${mergeBase}..HEAD`],
    { stdio: "pipe" }
  )
    .toString()
    .trim();

  return {
    baseRef,
    mergeBase,
    commits: parseCommits(commitsRaw),
    diffStat,
    changedFiles,
  };
}

export function getCommitHistory(limit = 120): GitCommit[] {
  try {
    const raw = execFileSync(
      "git",
      ["log", `-${limit}`, "--reverse", "--pretty=format:%H%x1f%s%x1f%b%x1f%ad%x1f%an%x1e", "--date=short"],
      { stdio: "pipe" }
    )
      .toString()
      .trim();

    return raw
      .split("\x1e")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [hash = "", subject = "", body = "", date = "", author = ""] = entry.split("\x1f");
        return {
          hash: hash.trim(),
          subject: subject.trim(),
          body: body.trim(),
          date: date.trim(),
          author: author.trim(),
        };
      })
      .filter((commit) => Boolean(commit.hash) && Boolean(commit.subject));
  } catch {
    failAndExit("Could not read git commit history.");
  }
}

export type StagedFileChange = {
  status: string;
  path: string;
};

export type StagedDiffMetrics = {
  fileCount: number;
  insertions: number;
  deletions: number;
  patchChars: number;
  truncated: boolean;
};

export type StagedContext = {
  files: StagedFileChange[];
  diffStat: string;
  patch: string;
  metrics: StagedDiffMetrics;
};

function parseNameStatusLine(line: string): StagedFileChange | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) {
    return null;
  }

  const status = parts[0].trim();
  const path = parts[parts.length - 1].trim();
  if (!status || !path) {
    return null;
  }

  return { status, path };
}

export function stageAll(): void {
  try {
    execFileSync("git", ["add", "."], { stdio: "inherit" });
  } catch {
    failAndExit("Failed to stage files with git add .");
  }
}

export function getStagedContext(maxPatchChars = 10000): StagedContext {
  try {
    const filesRaw = runGit(["diff", "--cached", "--name-status"]);
    const diffStat = runGit(["diff", "--cached", "--stat"]).trim();
    const patchRaw = runGit(["diff", "--cached"]);
    const numStatRaw = runGit(["diff", "--cached", "--numstat"]);

    const files = filesRaw
      .split(/\r?\n/)
      .map((line) => parseNameStatusLine(line))
      .filter((change): change is StagedFileChange => Boolean(change));

    let insertions = 0;
    let deletions = 0;
    for (const line of numStatRaw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const [added = "0", deleted = "0"] = trimmed.split(/\s+/);
      const addedValue = Number.parseInt(added, 10);
      const deletedValue = Number.parseInt(deleted, 10);
      insertions += Number.isNaN(addedValue) ? 0 : addedValue;
      deletions += Number.isNaN(deletedValue) ? 0 : deletedValue;
    }

    const truncated = patchRaw.length > maxPatchChars;
    const patch = truncated ? patchRaw.slice(0, maxPatchChars) : patchRaw;

    return {
      files,
      diffStat,
      patch: patch.trim(),
      metrics: {
        fileCount: files.length,
        insertions,
        deletions,
        patchChars: patchRaw.length,
        truncated,
      },
    };
  } catch {
    failAndExit("Failed to inspect staged changes.");
  }
}
