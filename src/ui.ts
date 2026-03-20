export const ui = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

export const symbols = {
  tick: "✔",
  warn: "⚠",
  cross: "✖",
  info: "ℹ",
  arrow: "›",
};

export function style(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${ui.reset}`;
}

function getDividerWidth(): number {
  const terminalWidth = process.stdout.columns || 80;
  return Math.max(40, Math.min(terminalWidth, 80));
}

export function divider(): void {
  console.log(style("─".repeat(getDividerWidth()), ui.gray));
}

export function section(title: string): void {
  console.log();
  console.log(style(`  ${title}  `, ui.bold, ui.magenta, ui.underline));
  console.log();
}

export function ok(label: string, message?: string): string {
  const prefix = `${style(symbols.tick, ui.green, ui.bold)} ${style(label, ui.green, ui.bold)}`;
  return message ? `${prefix} ${style(message, ui.gray)}` : prefix;
}

export function warn(label: string, message?: string): string {
  const prefix = `${style(symbols.warn, ui.yellow, ui.bold)} ${style(label, ui.yellow, ui.bold)}`;
  return message ? `${prefix} ${style(message, ui.gray)}` : prefix;
}

export function bad(label: string, message?: string): string {
  const prefix = `${style(symbols.cross, ui.red, ui.bold)} ${style(label, ui.red, ui.bold)}`;
  return message ? `${prefix} ${style(message, ui.gray)}` : prefix;
}

export function info(label: string, message?: string): string {
  const prefix = `${style(symbols.info, ui.cyan, ui.bold)} ${style(label, ui.cyan, ui.bold)}`;
  return message ? `${prefix} ${style(message, ui.gray)}` : prefix;
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
    const key = style(row.key.padEnd(keyWidth), ui.gray, ui.italic);
    console.log(`  ${key} ${style(symbols.arrow, ui.gray)} ${style(row.value, ui.bold)}`);
  }
}

export function printList(title: string, items: string[]): void {
  console.log(style(title, ui.bold, ui.cyan));
  if (items.length === 0) {
    console.log(`  ${style("(none)", ui.gray, ui.italic)}`);
    return;
  }
  for (const item of items) {
    console.log(`  ${style(symbols.arrow, ui.magenta)} ${item}`);
  }
}

export function failAndExit(message: string): never {
  console.error();
  console.error(bad(message));
  console.error();
  process.exit(1);
}

export async function withProgress<T>(message: string, work: () => Promise<T>): Promise<T> {
  if (!process.stdout.isTTY) {
    console.log(message);
    return work();
  }

  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frameIndex = 0;

  const render = () => {
    const frame = frames[frameIndex % frames.length];
    process.stdout.write(`\r${style(frame, ui.magenta)} ${style(message, ui.gray)}`);
    frameIndex += 1;
  };

  render();
  const timer = setInterval(render, 80);

  try {
    const result = await work();
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
    console.log(ok(message));
    return result;
  } catch (error) {
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
    console.log(bad(message));
    throw error;
  }
}
