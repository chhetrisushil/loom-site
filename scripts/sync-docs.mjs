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

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = resolve(HERE, "..");
const LOOM = process.env.LOOM_REPO ? resolve(process.env.LOOM_REPO) : resolve(SITE, "../loom");
const SRC = join(LOOM, "docs");
const OUT = join(SITE, "src", "content", "docs");

/** The curated public set: file → { title, section, order }. Order drives the sidebar. */
const PAGES = {
  "README.md": { slug: "overview", title: "Overview", section: "Start here", order: 0 },
  "getting-started.md": { slug: "getting-started", title: "Getting started", section: "Start here", order: 1 },
  "usage.md": { slug: "usage", title: "Usage — building an app", section: "Start here", order: 2 },
  "examples.md": { slug: "examples", title: "Examples", section: "Start here", order: 3 },

  "user-guide.md": { slug: "user-guide", title: "User guide", section: "Guides", order: 0 },
  "usage-cli.md": { slug: "cli", title: "CLI reference", section: "Guides", order: 1 },
  "plugins.md": { slug: "plugins", title: "Plugins", section: "Guides", order: 2 },
  "scaling.md": { slug: "scaling", title: "Scaling", section: "Guides", order: 3 },
  "benchmarks.md": { slug: "benchmarks", title: "Benchmarks", section: "Guides", order: 4 },
  "transient-interpreter.md": { slug: "transient-interpreter", title: "Transient interpreter", section: "Guides", order: 5 },

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

const titleFromBody = (body, fallback) => {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim().replace(/`/g, "") : fallback;
};

/** loom-repo doc path → site URL, or null when the target is not published. */
function targetFor(path) {
  const clean = path.replace(/^\.\//, "");
  if (PAGES[clean]) return `/docs/${PAGES[clean].slug}`;
  for (const { dir, prefix } of DIRS) {
    const m = clean.match(new RegExp(`^(?:\\.\\./)?${dir}/(.+)\\.md$`));
    if (m) return `/docs/${prefix}/${m[1]}`;
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

function emit(outPath, front, body) {
  mkdirSync(dirname(outPath), { recursive: true });
  const yaml = Object.entries(front)
    .map(([k, v]) => `${k}: ${typeof v === "number" ? v : JSON.stringify(String(v))}`)
    .join("\n");
  // Strip the leading H1 — the layout renders the title, so keeping it would duplicate it.
  writeFileSync(outPath, `---\n${yaml}\n---\n\n${body.replace(/^#\s+.+\n+/, "")}`);
}

function main() {
  if (!existsSync(SRC)) {
    console.error(
      `sync-docs: no docs at ${SRC}\n` +
        `The site builds from a sibling loom checkout. Clone it next to this repo, or set LOOM_REPO.`
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
      emit(join(OUT, prefix, `${base}.md`), {
        title: titleFromBody(raw, base),
        section,
        order: num ? Number(num[1]) : 0,
        source: `docs/${dir}/${file}`,
      }, rewriteLinks(raw, dir));
      count++;
    }
  }

  console.log(`sync-docs: wrote ${count} pages from ${SRC}`);
}

main();
