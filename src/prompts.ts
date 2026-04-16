import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { style, ui } from "./ui.js";

type AskConfirmationOptions = {
  defaultYes?: boolean;
};

// Layout (lines printed after the question header):
//
//   [blank]                  ← separador entre question e opções
//     ● Yes                  ← opção 1   (OPTION_LINES começa aqui)
//     ○ No                   ← opção 2
//   [blank]                  ← breathing room
//
// OPTION_LINES = 3  (yes + no + blank)
// PRE_OPTION_LINES = 2  (blank antes de yes + a linha de question em si)
//   → de cursor(yes) até question: 2 linhas acima

const OPTION_LINES = 3;
const PRE_OPTION_LINES = 2;

function renderOptions(selectedYes: boolean, isUpdate: boolean): void {
  const yes = selectedYes
    ? `    ${style("●", ui.cyan, ui.bold)} ${style("Yes", ui.cyan, ui.bold)}`
    : `    ${style("○", ui.gray)}  ${style("Yes", ui.gray)}`;
  const no = !selectedYes
    ? `    ${style("●", ui.cyan, ui.bold)} ${style("No", ui.cyan, ui.bold)}`
    : `    ${style("○", ui.gray)}  ${style("No", ui.gray)}`;

  if (isUpdate) {
    // Volta cursor para início do bloco de opções
    output.write(`\x1b[${OPTION_LINES}A`);
  }

  output.write(`\r\x1b[2K${yes}\n`);
  output.write(`\r\x1b[2K${no}\n`);
  output.write(`\r\x1b[2K\n`); // breathing line
}

export function askConfirmation(
  question: string,
  options: AskConfirmationOptions = {}
): Promise<boolean> {
  const cleanQuestion = question
    .replace(/\s*\(.*?\)\s*:?\s*$/, "")
    .replace(/:\s*$/, "")
    .trim();

  // Fallback para ambientes sem TTY (CI, pipes)
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return new Promise((resolve) => {
      const rl = createInterface({ input, output });
      rl.question(question).then((answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        resolve(normalized ? normalized === "y" : Boolean(options.defaultYes));
      });
    });
  }

  return new Promise((resolve) => {
    let selectedYes = options.defaultYes !== false;

    // Imprime a linha da pergunta (fixa, nunca redesenhada)
    output.write(`\n  ${style("?", ui.yellow, ui.bold)} ${style(cleanQuestion, ui.bold)}  ${style("↑↓ · Enter", ui.gray, ui.dim)}\n`);
    // Blank entre pergunta e opções
    output.write(`\n`);
    // Primeiro render das opções
    renderOptions(selectedYes, false);

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    function cleanup(result: boolean): void {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);

      const chosen = result
        ? `${style("●", ui.green, ui.bold)} ${style("Yes", ui.green, ui.bold)}`
        : `${style("●", ui.red, ui.bold)} ${style("No", ui.red, ui.bold)}`;

      // Sobe até a linha da pergunta (options + blank + question)
      output.write(`\x1b[${OPTION_LINES + PRE_OPTION_LINES}A`);
      // Reescreve a linha da pergunta com o resultado
      output.write(`\r\x1b[2K  ${style("✓", ui.green)} ${style(cleanQuestion, ui.dim)}  ${chosen}\n`);
      // Blank após confirmação
      output.write(`\n`);
      // Apaga tudo abaixo (as opções antigas)
      output.write(`\x1b[J`);

      resolve(result);
    }

    function onData(key: string): void {
      if (key === "\x03") {
        output.write("\n");
        process.exit(130);
      }

      // Setas cima/esquerda → Yes
      if (key === "\x1b[A" || key === "\x1b[D") {
        selectedYes = true;
        renderOptions(selectedYes, true);
        return;
      }

      // Setas baixo/direita → No
      if (key === "\x1b[B" || key === "\x1b[C") {
        selectedYes = false;
        renderOptions(selectedYes, true);
        return;
      }

      // Espaço → alterna
      if (key === " ") {
        selectedYes = !selectedYes;
        renderOptions(selectedYes, true);
        return;
      }

      // Atalhos de teclado diretos
      if (key === "y" || key === "Y") { cleanup(true); return; }
      if (key === "n" || key === "N") { cleanup(false); return; }

      // Enter confirma a seleção atual
      if (key === "\r" || key === "\n") {
        cleanup(selectedYes);
        return;
      }
    }

    process.stdin.on("data", onData);
  });
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
