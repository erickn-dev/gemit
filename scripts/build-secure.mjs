import { readFileSync, rmSync, writeFileSync } from "fs";
import { cp, readdir } from "fs/promises";
import { join } from "path";
import JavaScriptObfuscator from "javascript-obfuscator";

const SOURCE_DIR = "dist";
const TARGET_DIR = "dist-secure";

async function getJsFiles(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && fullPath.endsWith(".js")) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function obfuscateFile(path) {
  const original = readFileSync(path, "utf8");
  const hasShebang = original.startsWith("#!");
  const source = hasShebang ? original.slice(original.indexOf("\n") + 1) : original;

  const result = JavaScriptObfuscator.obfuscate(source, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.15,
    identifierNamesGenerator: "hexadecimal",
    renameGlobals: false,
    stringArray: true,
    stringArrayThreshold: 0.75,
    splitStrings: true,
    splitStringsChunkLength: 8,
    selfDefending: true,
    simplify: true,
    unicodeEscapeSequence: false,
  });

  const output = hasShebang ? `#!/usr/bin/env node\n${result.getObfuscatedCode()}` : result.getObfuscatedCode();
  writeFileSync(path, output, "utf8");
}

async function main() {
  rmSync(TARGET_DIR, { recursive: true, force: true });
  await cp(SOURCE_DIR, TARGET_DIR, { recursive: true });

  const jsFiles = await getJsFiles(TARGET_DIR);
  for (const file of jsFiles) {
    obfuscateFile(file);
  }

  console.log(`Secure build generated at ${TARGET_DIR} (${jsFiles.length} JS files obfuscated).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
