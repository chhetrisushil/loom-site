#!/usr/bin/env node
// Builds the Pagefind search index over the already-built `dist/`, then mirrors the bundle into
// `public/` so `astro dev` serves it too.
//
// Why the mirror: Pagefind indexes rendered HTML, which only exists after `astro build`. Without
// the copy the search box would be permanently dead in dev, which is exactly where it gets
// iterated on. `public/pagefind/` is gitignored — it is a build artifact, same reasoning as
// `src/content/docs/`.

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const bundle = join(dist, "pagefind");
const mirror = join(root, "public", "pagefind");

if (!existsSync(dist)) {
  console.error("index-search: dist/ is missing — run `astro build` first.");
  process.exit(1);
}

// `astro build` copies public/ into dist/, which means the *previous* run's mirrored bundle is
// sitting in dist/pagefind right now. Pagefind's output files are content-hashed, so without this
// wipe every build leaves another orphaned .pf_meta / index chunk behind, published forever.
rmSync(bundle, { recursive: true, force: true });

// Mermaid sources are graph DSL, not prose: indexing them buries real hits under `graph TD`.
const args = [
  "--site",
  dist,
  "--exclude-selectors",
  "pre[data-language='mermaid'], .edit",
];

const bin = join(root, "node_modules", ".bin", "pagefind");
const run = spawnSync(bin, args, { stdio: "inherit" });
if (run.status !== 0) {
  console.error("index-search: pagefind failed.");
  process.exit(run.status ?? 1);
}

if (!existsSync(bundle)) {
  console.error("index-search: pagefind produced no bundle at dist/pagefind.");
  process.exit(1);
}

// Pagefind also emits its own drop-in search UIs. Search.astro drives the JS API directly, so
// these are ~415 KB of never-loaded bundles — and, published, they are live URLs on the docs
// domain serving a UI that is not this site's. Everything the JS API needs (pagefind.js, the
// worker, the wasm, index/fragment/filter) stays.
for (const f of [
  "pagefind-ui.js",
  "pagefind-ui.css",
  "pagefind-modular-ui.js",
  "pagefind-modular-ui.css",
  "pagefind-component-ui.js",
  "pagefind-component-ui.css",
  "pagefind-highlight.js",
]) {
  rmSync(join(bundle, f), { force: true });
}

rmSync(mirror, { recursive: true, force: true });
cpSync(bundle, mirror, { recursive: true });
console.log("index-search: mirrored dist/pagefind -> public/pagefind");
