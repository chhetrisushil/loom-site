// Fitness function: every internal link in the BUILT site resolves to something that was built.
//
// This exists because two independent bugs shipped and nothing noticed. `astro check` type-checks
// components; it never opens the emitted HTML, and a markdown link is just text until it is.
//
//   1. `sync-docs.mjs` rewrote doc links to `/docs/…` with no base prefix, so 365 links pointed at
//      `chhetrisushil.github.io/docs/…` — a different repo's user site.
//   2. Link targets were derived from the FILENAME while Astro derives the route from a SLUGIFIED
//      id, so every link to `0016-loom-2.0-…` (18 of them) addressed a page that is never built.
//
// Both are invisible in source review and obvious the moment you read `dist/`. So read `dist/`.
//
// Deliberately limited to internal links: external URLs would make this a network test, flaky and
// slow, and a 404 on someone else's site is not a defect in this build.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE } from "../site.config.mjs";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(SITE, "dist");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error("check-links: no dist/ — run `pnpm build` first.");
  process.exit(1);
}

const files = walk(DIST);
const html = files.filter((f) => f.endsWith(".html"));

/** Every route the build actually produced, as a site path with no base and no trailing slash. */
const routes = new Set(
  html
    .filter((f) => f.endsWith("index.html"))
    .map((f) => {
      const rel = relative(DIST, dirname(f)).split("\\").join("/");
      return rel === "" ? "/" : `/${rel}`;
    })
);

const problems = [];
let checked = 0;

for (const file of html) {
  const body = readFileSync(file, "utf8");
  const where = relative(DIST, file);
  for (const [, href] of body.matchAll(/href="([^"]+)"/g)) {
    if (!href.startsWith("/")) continue; // relative, external, anchor-only, mailto: — not ours
    checked++;
    const path = href.split("#")[0].split("?")[0].replace(/\/$/, "");
    if (!path.startsWith(BASE)) {
      problems.push(`${where}: "${href}" is missing the ${BASE} base prefix`);
      continue;
    }
    const rest = path.slice(BASE.length) || "/";
    if (routes.has(rest)) continue;
    if (existsSync(join(DIST, rest.replace(/^\//, "")))) continue; // a static asset
    problems.push(`${where}: "${href}" resolves to no built page`);
  }
}

// One line per distinct target, not per occurrence: 18 links to one dead ADR is one defect.
const unique = [...new Set(problems.map((p) => p.slice(p.indexOf(": ") + 2)))];
console.log(`check-links: ${checked} internal links across ${html.length} pages, ${routes.size} routes`);
if (unique.length > 0) {
  for (const u of unique.slice(0, 40)) console.error(`  ✗ ${u}`);
  if (unique.length > 40) console.error(`  … and ${unique.length - 40} more`);
  console.error(`${unique.length} broken internal link target(s)`);
  process.exit(1);
}
console.log("check-links: ✓ every internal link resolves");
