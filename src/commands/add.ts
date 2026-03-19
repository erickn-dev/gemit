import { failAndExit } from "../ui.js";
import { generateCommit } from "./commit.js";

type AddOptions = {
  all?: boolean;
  check?: boolean;
};

export async function addAndCommit(options: AddOptions = {}): Promise<void> {
  if (!options.all) {
    failAndExit("Use `gemit add --all` to stage everything and continue the suggestion flow.");
  }

  await generateCommit({ all: true, check: Boolean(options.check) });
}
