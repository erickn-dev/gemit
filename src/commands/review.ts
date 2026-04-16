import { createLLM, extractMessageText } from "../llm.js";
import { getStagedContext } from "../git.js";
import { failAndExit, info, ok, printKeyValues, section, style, ui, warn, withProgress } from "../ui.js";

function getLLM() {
  try {
    return createLLM();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failAndExit(message);
  }
}

const REVIEW_PROMPT = `You are a senior software engineer doing a code review.
Analyze the staged diff below and provide a concise review.

Rules:
- Point out bugs, logic errors, or security issues (CRITICAL)
- Point out code smells, bad practices, or maintainability issues (WARNING)
- Point out minor style or naming issues (INFO)
- If the code looks good, say so clearly
- Be concise and actionable. No fluff.
- Use this format:
  [CRITICAL] description
  [WARNING]  description
  [INFO]     description
  [OK]       Everything looks good (if no issues found)

Staged diff:
{{patch}}

Staged files:
{{staged_files}}`;

export async function reviewStagedChanges(): Promise<void> {
  const llm = getLLM();

  const staged = getStagedContext(15000);

  if (staged.files.length === 0) {
    failAndExit("No staged files. Stage changes first.");
  }

  section("REVIEW");
  printKeyValues([
    { key: "Files", value: String(staged.metrics.fileCount) },
    { key: "Insertions", value: style(`+${staged.metrics.insertions}`, ui.green) },
    { key: "Deletions", value: style(`-${staged.metrics.deletions}`, ui.red) },
  ]);

  const stagedFiles = staged.files.map((f) => `${f.status} ${f.path}`).join("\n");
  const patchContent = staged.patch
    ? `${staged.patch}${staged.metrics.truncated ? "\n(truncated)" : ""}`
    : "(no patch available)";

  const prompt = REVIEW_PROMPT
    .replace("{{patch}}", patchContent)
    .replace("{{staged_files}}", stagedFiles);

  const result = await withProgress("AI is reviewing your changes...", () => llm.invoke(prompt));
  const review = extractMessageText(result.content);

  if (!review) {
    failAndExit("Failed to generate code review.");
  }

  section("FINDINGS");
  const lines = review.split("\n").filter(Boolean);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[CRITICAL]")) {
      console.log(`  ${style("✗", ui.red, ui.bold)} ${style(trimmed.replace("[CRITICAL]", "").trim(), ui.red)}`);
    } else if (trimmed.startsWith("[WARNING]")) {
      console.log(`  ${style("⚠", ui.yellow, ui.bold)} ${style(trimmed.replace("[WARNING]", "").trim(), ui.yellow)}`);
    } else if (trimmed.startsWith("[INFO]")) {
      console.log(`  ${style("●", ui.cyan)} ${trimmed.replace("[INFO]", "").trim()}`);
    } else if (trimmed.startsWith("[OK]")) {
      console.log(`  ${ok("OK", trimmed.replace("[OK]", "").trim())}`);
    } else {
      console.log(`  ${style(trimmed, ui.dim)}`);
    }
  }
  console.log();
}
