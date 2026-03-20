export const ui = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

export function style(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${ui.reset}`;
}

function getDividerWidth(): number {
  const terminalWidth = process.stdout.columns || 80;
  return Math.max(40, Math.min(terminalWidth, 100));
}

export function divider(): void {
  console.log(style("-".repeat(getDividerWidth()), ui.dim));
}

export function section(title: string): void {
  console.log();
  divider();
  console.log(style(`[ ${title} ]`, ui.bold, ui.cyan));
  divider();
}

export function ok(text: string): string {
  return style(text, ui.green, ui.bold);
}

export function warn(text: string): string {
  return style(text, ui.yellow, ui.bold);
}

export function bad(text: string): string {
  return style(text, ui.red, ui.bold);
}

export function info(text: string): string {
  return style(text, ui.cyan, ui.bold);
}

type KeyValueRow = {
  key: string;
  value: string;
};

export function printKeyValues(rows: KeyValueRow[]): void {
  if (rows.length === 0) {
    return;
  }

  const keyWidth = rows.reduce((max, row) => Math.max(max, row.key.length), 0);
  for (const row of rows) {
    const key = style(row.key.padEnd(keyWidth), ui.dim);
    console.log(`  ${key} : ${row.value}`);
  }
}

export function printList(title: string, items: string[]): void {
  console.log(style(title, ui.bold));
  if (items.length === 0) {
    console.log(`  ${style("(none)", ui.dim)}`);
    return;
  }
  for (const item of items) {
    console.log(`  - ${item}`);
  }
}

export function failAndExit(message: string): never {
  console.error(`${bad("ERROR")} ${message}`);
  process.exit(1);
}

export async function withProgress<T>(message: string, work: () => Promise<T>): Promise<T> {
  if (!process.stdout.isTTY) {
    console.log(message);
    return work();
  }

  const frames = ["|", "/", "-", "\\"];
  let frameIndex = 0;

  const render = () => {
    const frame = frames[frameIndex % frames.length];
    process.stdout.write(`\r${style(frame, ui.cyan)} ${message}`);
    frameIndex += 1;
  };

  render();
  const timer = setInterval(render, 120);

  try {
    const result = await work();
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
    console.log(`${ok("OK")} ${message}`);
    return result;
  } catch (error) {
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
    console.log(`${bad("ERROR")} ${message}`);
    throw error;
  }
}
