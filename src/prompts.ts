import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

type AskConfirmationOptions = {
  defaultYes?: boolean;
};

export async function askConfirmation(
  question: string,
  options: AskConfirmationOptions = {}
): Promise<boolean> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  const normalized = answer.trim().toLowerCase();
  if (!normalized) {
    return Boolean(options.defaultYes);
  }
  return normalized === "y";
}

export async function askInput(question: string): Promise<string> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

export async function askEditableInput(question: string, defaultValue: string): Promise<string> {
  const rl = createInterface({ input, output });
  const answer = await rl.question(question);
  rl.close();
  const trimmed = answer.trim();
  if (!trimmed) {
    return defaultValue;
  }
  return trimmed;
}
