// Copy the PUBLIC subset of ../loom/docs into src/content/docs, rewriting links for the site.
//
// The docs live in the loom repo — that is where they are edited and reviewed, and vendoring a
// second copy here would guarantee they drift apart (the failure this project has hit in every
// sibling repo). So the site syncs at build time and treats its copy as a build artifact:
// src/content/docs/ is gitignored.
//
// PUBLICATION BOUNDARY. loom is a PRIVATE repo; this site is public. Only the files named in
// PAGES + the ADR/spec directories are published. `docs/requirements/` (internal evaluation
// docs), `docs/presentation/` (decks) and `docs/loom-2.0/` are deliberately excluded and must
// stay that way — an allowlist, never a denylist, so a new internal doc is private by default.
//
// loom-ui — a second private sibling repo, a UI framework built on loom — is synced the same
// way, into its own "loom-ui" section: LOOM_UI_PAGES below is an explicit allowlist of its
// README plus per-package READMEs (only those that exist are published). Its README names one
// real consumer, genUI, which is itself a private product; that section is stripped on the way
// out (see `stripSection`) and `assertNoGenui` fails the build if the name leaks anywhere else.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE } from "../site.config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..");
const LOOM = process.env.LOOM_REPO ? resolve(process.env.LOOM_REPO) : resolve(SITE, "../loom");
const SRC = join(LOOM, "docs");
const OUT = join(SITE, "src", "content", "docs");
const LOOM_UI = process.env.LOOM_UI_REPO ? resolve(process.env.LOOM_UI_REPO) : resolve(SITE, "../loom-ui");

/** The curated public set: file → { title, section, order }. Order drives the sidebar. */
const PAGES = {
  "README.md": { slug: "overview", title: "Overview", section: "Start here", order: 0 },
  "getting-started.md": { slug: "getting-started", title: "Getting started", section: "Start here", order: 1 },
  "usage.md": { slug: "usage", title: "Usage — building an app", section: "Start here", order: 2 },
  "examples.md": { slug: "examples", title: "Examples", section: "Start here", order: 3 },

  "cheatsheet-features.md": { slug: "cheatsheet-features", title: "Cheatsheet — features", section: "Start here", order: 4 },
  "cheatsheet-dx.md": { slug: "cheatsheet-dx", title: "Cheatsheet — working with Loom", section: "Start here", order: 5 },

  "user-guide.md": { slug: "user-guide", title: "User guide", section: "Guides", order: 0 },
  "usage-cli.md": { slug: "cli", title: "CLI reference", section: "Guides", order: 1 },
  "plugins.md": { slug: "plugins", title: "Plugins", section: "Guides", order: 2 },
  "scaling.md": { slug: "scaling", title: "Scaling", section: "Guides", order: 3 },
  "benchmarks.md": { slug: "benchmarks", title: "Benchmarks", section: "Guides", order: 4 },
  "transient-interpreter.md": { slug: "transient-interpreter", title: "Transient interpreter", section: "Guides", order: 5 },
  "composed-surfaces.md": { slug: "composed-surfaces", title: "Composed surfaces", section: "Guides", order: 6 },

  "architecture.md": { slug: "architecture", title: "Architecture", section: "Reference", order: 0 },
  "data-classification.md": { slug: "data-classification", title: "Data classification", section: "Reference", order: 1 },
  "data-protection-patterns.md": { slug: "data-protection", title: "Data-protection patterns", section: "Reference", order: 2 },
  "compliance.md": { slug: "compliance", title: "Compliance", section: "Reference", order: 3 },
  "acceptance-governance.md": { slug: "acceptance-governance", title: "Acceptance governance", section: "Reference", order: 4 },
};

/** Directories published wholesale, each becoming its own sidebar section. */
const DIRS = [
  { dir: "spec", section: "Specification", prefix: "spec" },
  { dir: "adr", section: "Decision records", prefix: "adr" },
];

/**
 * The loom-ui allowlist: its README plus one README per package, published only when the file
 * exists in the checkout (a package with no README yet is simply skipped, same as a missing
 * PAGES entry above). `slug` fixes the route: the overview lands at exactly `/docs/loom-ui`, the
 * rest nest under it as `/docs/loom-ui/<package>`.
 */
const LOOM_UI_SECTION = "loom-ui";
const LOOM_UI_PAGES = {
  "README.md": { slug: "loom-ui", title: "loom-ui", order: 0 },
  "packages/core/README.md": { slug: "loom-ui/core", title: "@loom-ui/core", order: 1 },
  "packages/hydration/README.md": { slug: "loom-ui/hydration", title: "@loom-ui/hydration", order: 2 },
  "packages/planner/README.md": { slug: "loom-ui/planner", title: "@loom-ui/planner", order: 3 },
  "packages/renderer-lit/README.md": { slug: "loom-ui/renderer-lit", title: "@loom-ui/renderer-lit", order: 4 },
  "packages/renderer-terminal/README.md": {
    slug: "loom-ui/renderer-terminal",
    title: "@loom-ui/renderer-terminal",
    order: 5,
  },
};

// A word-boundary match so "genuine"/"ingenuity" never trip this — but "genUI", "GenUI", "genui-*"
// all do, and so does the literal CSS-class prefix "gx-" genUI's own components use.
const GENUI_PATTERN = /\bgenui\b|gx-/i;

/** Fails the build outright: loom-ui's docs must never surface its private consumer. */
function assertNoGenui(content, where) {
  const m = content.match(GENUI_PATTERN);
  if (m) {
    console.error(
      `sync-docs: refusing to publish ${where} — found "${m[0]}" (genUI is a private product; ` +
        `strip it from the loom-ui source, or from the sync script's rewriting, before publishing)`
    );
    process.exit(1);
  }
}

/**
 * Remove a markdown section by its exact heading text, from that heading up to (not including)
 * the next heading of the same or shallower level, or EOF. loom-ui's README names genUI only
 * under "## Consumers" — nothing else in the page needs redacting.
 */
function stripSection(body, headingText) {
  const lines = body.split("\n");
  const start = lines.findIndex(
    (l) => /^#{1,6}\s+/.test(l) && l.replace(/^#{1,6}\s+/, "").trim() === headingText
  );
  if (start === -1) return body;
  const level = lines[start].match(/^(#{1,6})/)[1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}

/**
 * The id Astro will give a content file — and therefore the URL segment.
 *
 * Astro slugifies each path segment (lowercase, drop anything outside [\w\s-], spaces to
 * hyphens), so `0016-loom-2.0-execution-runtime-and-decision-seam.md` is served at
 * `…/0016-loom-20-execution-runtime-and-decision-seam`. Deriving the link target from the
 * FILENAME instead left 18 links to that ADR pointing at a page that is never built.
 *
 * Applying it here — to the emitted filename as well as to the link — makes the two agree by
 * construction: every name this writes already matches [a-z0-9-]+, on which Astro's slugify is
 * the identity, so there is no second transformation left to disagree with.
 */
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s/g, "-");

const titleFromBody = (body, fallback) => {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim().replace(/`/g, "") : fallback;
};

/** loom-repo doc path → site URL, or null when the target is not published. */
function targetFor(path) {
  const clean = path.replace(/^\.\//, "");
  // BASE, not a bare "/docs/…": Astro prefixes its OWN URLs with the base, but a link written
  // into markdown reaches the HTML verbatim. Without this the site emits absolute links to a
  // different origin path entirely — they 404, and nothing in the build notices.
  if (PAGES[clean]) return `${BASE}/docs/${PAGES[clean].slug}`;
  for (const { dir, prefix } of DIRS) {
    const m = clean.match(new RegExp(`^(?:\\.\\./)?${dir}/(.+)\\.md$`));
    if (m) return `${BASE}/docs/${prefix}/${slugify(m[1])}`;
  }
  return null;
}

/**
 * Rewrite relative markdown links.
 *
 * A link to a published page becomes a site route. A link to something NOT published (a
 * requirements doc, a deck, a source file) would 404, so it degrades to plain text plus a code
 * span naming the repo path — the same convention loom-examples uses for cross-repo references.
 * Silently leaving a dead link would be worse than saying "this lives in the repo".
 */
function rewriteLinks(body, fromDir) {
  return body.replace(/\[([^\]]+)\]\((?!https?:|#|mailto:)([^)#\s]+)(#[^)\s]*)?\)/g, (_all, text, href, hash = "") => {
    const rel = fromDir ? `${fromDir}/${href}`.replace(/[^/]+\/\.\.\//g, "") : href;
    const target = targetFor(rel) ?? targetFor(href);
    if (target) return `[${text}](${target}${hash})`;
    const repoPath = rel.replace(/^\.\//, "").replace(/^\.\.\//, "");
    return `${text} (\`loom/docs/${repoPath}\`)`;
  });
}

/** loom-ui-repo path (relative to its root) → site URL, or null when not published. */
function targetForLoomUi(path) {
  const clean = path.replace(/^\.\//, "");
  if (LOOM_UI_PAGES[clean]) return `${BASE}/docs/${LOOM_UI_PAGES[clean].slug}`;
  return null;
}

/**
 * Rewrite relative markdown links inside a loom-ui page, same convention as `rewriteLinks`: a
 * link to a published loom-ui page becomes a site route. A link that reaches into the sibling
 * loom checkout (`../loom/docs/…`) resolves to that page's site route when loom publishes it too.
 * Anything else — an internal file, AGENTS.md, a requirements doc — degrades to plain text naming
 * its repo-relative path, never a dead link.
 */
function rewriteLoomUiLinks(body, fromDir) {
  return body.replace(/\[([^\]]+)\]\((?!https?:|#|mailto:)([^)#\s]+)(#[^)\s]*)?\)/g, (_all, text, href, hash = "") => {
    const rel = fromDir ? `${fromDir}/${href}`.replace(/[^/]+\/\.\.\//g, "") : href;
    const crossLoom = (rel.match(/^(?:\.\.\/)*loom\/docs\/(.+)$/) ?? href.match(/^(?:\.\.\/)*loom\/docs\/(.+)$/))?.[1];
    if (crossLoom) {
      const loomTarget = targetFor(crossLoom);
      if (loomTarget) return `[${text}](${loomTarget}${hash})`;
      return `${text} (\`loom/docs/${crossLoom}\`)`;
    }
    const target = targetForLoomUi(rel) ?? targetForLoomUi(href);
    if (target) return `[${text}](${target}${hash})`;
    const repoPath = rel.replace(/^\.\//, "").replace(/^\.\.\//, "");
    return `${text} (\`loom-ui/${repoPath}\`)`;
  });
}

function emit(outPath, front, body, { guard } = {}) {
  const yaml = Object.entries(front)
    .map(([k, v]) => `${k}: ${typeof v === "number" ? v : JSON.stringify(String(v))}`)
    .join("\n");
  // Strip the leading H1 — the layout renders the title, so keeping it would duplicate it.
  const content = `---\n${yaml}\n---\n\n${body.replace(/^#\s+.+\n+/, "")}`;
  if (guard) guard(content, outPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, content);
}

/** Sync the loom-ui allowlist. Returns the number of pages written. */
function syncLoomUi() {
  let count = 0;
  for (const [file, meta] of Object.entries(LOOM_UI_PAGES)) {
    const src = join(LOOM_UI, file);
    if (!existsSync(src)) {
      console.warn(`sync-docs: SKIP missing loom-ui/${file}`);
      continue;
    }
    const raw = readFileSync(src, "utf8");
    const stripped = stripSection(raw, "Consumers");
    const fromDir = dirname(file);
    const body = rewriteLoomUiLinks(stripped, fromDir === "." ? "" : fromDir);
    emit(
      join(OUT, `${meta.slug}.md`),
      { title: meta.title, section: LOOM_UI_SECTION, order: meta.order, source: file, repo: "loom-ui" },
      body,
      { guard: (content, where) => assertNoGenui(content, where) }
    );
    count++;
  }
  return count;
}

function main() {
  if (!existsSync(SRC)) {
    console.error(
      `sync-docs: no docs at ${SRC}\n` +
        `The site builds from a sibling loom checkout. Clone it next to this repo, or set LOOM_REPO.`
    );
    process.exit(1);
  }
  if (!existsSync(LOOM_UI)) {
    console.error(
      `sync-docs: no loom-ui checkout at ${LOOM_UI}\n` +
        `The site builds loom-ui's docs from a sibling loom-ui checkout. Clone it next to this repo, or set LOOM_UI_REPO.`
    );
    process.exit(1);
  }
  rmSync(OUT, { recursive: true, force: true });
  let count = 0;

  for (const [file, meta] of Object.entries(PAGES)) {
    const src = join(SRC, file);
    if (!existsSync(src)) {
      console.warn(`sync-docs: SKIP missing ${file}`);
      continue;
    }
    const raw = readFileSync(src, "utf8");
    emit(join(OUT, `${meta.slug}.md`), {
      title: meta.title || titleFromBody(raw, meta.slug),
      section: meta.section,
      order: meta.order,
      source: `docs/${file}`,
    }, rewriteLinks(raw, ""));
    count++;
  }

  for (const { dir, section, prefix } of DIRS) {
    const from = join(SRC, dir);
    if (!existsSync(from)) continue;
    for (const file of readdirSync(from).filter((f) => f.endsWith(".md")).sort()) {
      const raw = readFileSync(join(from, file), "utf8");
      const base = file.replace(/\.md$/, "");
      // ADRs sort by their number; everything else alphabetically.
      const num = base.match(/^(\d{4})/);
      emit(join(OUT, prefix, `${slugify(base)}.md`), {
        title: titleFromBody(raw, base),
        section,
        order: num ? Number(num[1]) : 0,
        source: `docs/${dir}/${file}`,
      }, rewriteLinks(raw, dir));
      count++;
    }
  }

  console.log(`sync-docs: wrote ${count} pages from ${SRC}`);

  const uiCount = syncLoomUi();
  count += uiCount;
  console.log(`sync-docs: wrote ${uiCount} loom-ui page(s) from ${LOOM_UI}`);
  console.log(`sync-docs: wrote ${count} pages total`);
}

main();
