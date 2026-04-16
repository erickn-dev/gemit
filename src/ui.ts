export const ui = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

export const symbols = {
  tick: "✓",
  warn: "⚠",
  cross: "✗",
  bullet: "●",
  dot: "·",
  arrow: "→",
  treeItem: "├─",
  treeLast: "└─",
  treePipe: "│",
  h: "─",
  v: "│",
  tl: "╭",
  tr: "╮",
  bl: "╰",
  br: "╯",
};

export function style(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${ui.reset}`;
}

function termWidth(): number {
  return Math.max(40, Math.min(process.stdout.columns || 80, 88));
}

// ╭─ TITLE ──────────────────────────
export function section(title: string): void {
  const label = ` ${title} `;
  const fill = symbols.h.repeat(Math.max(0, termWidth() - label.length - 2));
  console.log();
  console.log(
    style(symbols.tl + symbols.h, ui.gray) +
    style(label, ui.bold) +
    style(fill, ui.gray)
  );
}

export function ok(label: string, message?: string): string {
  const prefix = `${style(symbols.tick, ui.green)} ${style(label, ui.green, ui.bold)}`;
  return message ? `${prefix}  ${style(message, ui.gray)}` : prefix;
}

export function warn(label: string, message?: string): string {
  const prefix = `${style(symbols.warn, ui.yellow, ui.bold)} ${style(label, ui.yellow, ui.bold)}`;
  return message ? `${prefix}  ${style(message, ui.gray)}` : prefix;
}

export function bad(label: string, message?: string): string {
  const prefix = `${style(symbols.cross, ui.red, ui.bold)} ${style(label, ui.red, ui.bold)}`;
  return message ? `${prefix}  ${style(message, ui.gray)}` : prefix;
}

export function info(label: string, message?: string): string {
  const prefix = `${style(symbols.bullet, ui.cyan)} ${style(label, ui.cyan, ui.bold)}`;
  return message ? `${prefix}  ${style(message, ui.gray)}` : prefix;
}

type KeyValueRow = {
  key: string;
  value: string;
};

//   ├─ key    value
//   └─ key    value  (last)
export function printKeyValues(rows: KeyValueRow[]): void {
  if (rows.length === 0) return;

  const keyWidth = rows.reduce((max, row) => Math.max(max, row.key.length), 0);

  for (let i = 0; i < rows.length; i++) {
    const isLast = i === rows.length - 1;
    const connector = style(isLast ? symbols.treeLast : symbols.treeItem, ui.gray);
    const key = style(rows[i].key.padEnd(keyWidth), ui.gray, ui.italic);
    console.log(`  ${connector} ${key}  ${rows[i].value}`);
  }
}

//   Title
//   ├─ item
//   └─ item  (last)
export function printList(title: string, items: string[]): void {
  console.log(`  ${style(title, ui.bold)}`);

  if (items.length === 0) {
    console.log(`  ${style(symbols.treeLast, ui.gray)} ${style("(none)", ui.gray, ui.italic)}`);
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const isLast = i === items.length - 1;
    const connector = style(isLast ? symbols.treeLast : symbols.treeItem, ui.gray);
    console.log(`  ${connector} ${style(items[i], ui.dim)}`);
  }
}

// ╭─ Warning ──────────────────────────
// │  ⚠ message
// ╰────────────────────────────────────
export function warnBlock(message: string): void {
  const width = termWidth();
  const topLabel = ` Warning `;
  const topFill = symbols.h.repeat(Math.max(0, width - topLabel.length - 2));
  const botFill = symbols.h.repeat(Math.max(0, width - 2));

  console.warn();
  console.warn(
    style(symbols.tl + symbols.h, ui.yellow) +
    style(topLabel, ui.yellow, ui.bold) +
    style(topFill, ui.yellow)
  );
  console.warn(
    style(symbols.v + " ", ui.yellow) +
    ` ${style(symbols.warn, ui.yellow, ui.bold)} ${style(message, ui.yellow)}`
  );
  console.warn(style(symbols.bl + botFill + symbols.br, ui.yellow));
  console.warn();
}

// ╭─ Error ────────────────────────────
// │  ✗ message
// ╰────────────────────────────────────
export function failAndExit(message: string, hint?: string): never {
  const width = termWidth();
  const topLabel = ` Error `;
  const topFill = symbols.h.repeat(Math.max(0, width - topLabel.length - 2));
  const botFill = symbols.h.repeat(Math.max(0, width - 2));

  console.error();
  console.error(
    style(symbols.tl + symbols.h, ui.red) +
    style(topLabel, ui.red, ui.bold) +
    style(topFill, ui.red)
  );
  console.error(
    style(symbols.v + " ", ui.red) +
    ` ${style(symbols.cross, ui.red, ui.bold)} ${style(message, ui.red)}`
  );
  if (hint) {
    console.error(
      style(symbols.v + " ", ui.red) +
      `   ${style(symbols.arrow, ui.gray)} ${style(hint, ui.gray, ui.italic)}`
    );
  }
  console.error(style(symbols.bl + botFill + symbols.br, ui.red));
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
    const frame = style(frames[frameIndex % frames.length], ui.cyan);
    process.stdout.write(`\r  ${frame}  ${style(message, ui.dim)}`);
    frameIndex += 1;
  };

  render();
  const timer = setInterval(render, 80);

  try {
    const result = await work();
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
    console.log(`  ${ok("Done")}  ${style(message, ui.dim)}`);
    return result;
  } catch (error) {
    clearInterval(timer);
    process.stdout.write("\r\x1b[2K");
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`  ${bad("Failed")}  ${style(reason, ui.dim)}`);
    throw error;
  }
}
