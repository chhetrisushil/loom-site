// Fitness function: no raw control bytes in this repo's own tracked files.
//
// A literal NUL byte makes git classify the WHOLE file as binary. `git diff`, `blame` and
// `log -p` then report "-" and show no content at all, so every review of that file flies
// blind — and nothing announces it, because the tool that would tell you is the tool that
// has been disabled. The upstream loom repo had a file in exactly that state from the day it
// was written (a composite-key separator written as the character instead of the `\u0000`
// escape, which produces the identical string with none of the damage); it went unnoticed
// for months. This is the port of the guard added there.
//
// Ported rather than assumed unnecessary: this repo was clean when the scan first ran, which
// says nothing about tomorrow. The failure mode is silence, so "we would notice" is exactly
// the assumption that failed upstream.
//
// SCOPE IS `git ls-files` — what this repo OWNS. That deliberately excludes `src/content/docs/`,
// which `sync-docs.mjs` writes at build time from the private ../loom checkout: it is gitignored
// here, and loom runs this same check over its own `docs/` tree, so guarding it here would
// duplicate a check at the wrong end of the pipe and fail in a repo that cannot fix it.
// Using git's own file list also means this can never drift from .gitignore.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Assets that are legitimately binary — a control byte in these means nothing. */
const BINARY = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".zip", ".gz", ".mp4", ".mov", ".wasm",
]);

/**
 * Control characters that must never appear RAW in a text file. Tab, newline and carriage
 * return are the three that legitimately do; everything else below 0x20 (plus DEL) belongs
 * in source only as an escape. NUL is the one that actually breaks git, but ESC — easy to
 * paste in from terminal output — is the same mistake with a quieter blast radius.
 */
function findControlBytes(content) {
  const found = [];
  let line = 1;
  for (const byte of content) {
    if (byte === 0x0a) {
      line++;
      continue;
    }
    if (byte === 0x09 || byte === 0x0d) continue;
    if (byte < 0x20 || byte === 0x7f) found.push({ line, codePoint: byte });
  }
  return found;
}

let tracked;
try {
  tracked = execFileSync("git", ["ls-files", "-z"], { cwd: SITE, maxBuffer: 32 * 1024 * 1024 })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
} catch (err) {
  console.error(`check-source-hygiene: could not list tracked files — ${err.message}`);
  process.exit(1);
}

const files = tracked.filter((f) => !BINARY.has(extname(f).toLowerCase()));
if (files.length === 0) {
  // The vacuous-check guard: an empty file list would make this pass forever.
  console.error("check-source-hygiene: no files to check — the scan is not doing anything.");
  process.exit(1);
}

const problems = [];
for (const file of files) {
  for (const { line, codePoint } of findControlBytes(readFileSync(join(SITE, file)))) {
    // Named with file and line, not counted: "3 control bytes" sends the reader hunting for
    // a file git will refuse to show them.
    problems.push(`${file}:${line} contains \\u${codePoint.toString(16).padStart(4, "0")}`);
  }
}

console.log(`check-source-hygiene: ${files.length} tracked text files`);
if (problems.length > 0) {
  for (const p of problems.slice(0, 40)) console.error(`  ✗ ${p}`);
  if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
  console.error(
    `${problems.length} raw control byte(s). Write the escape (e.g. \\u0000) instead of the character.`
  );
  process.exit(1);
}
console.log("check-source-hygiene: ✓ no raw control bytes");
