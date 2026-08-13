# loom-site

The documentation site for **Loom** — the execution kernel for agentic applications.

Built with [Astro](https://astro.build), output is fully static, deployed to GitHub Pages at
**https://chhetrisushil.github.io/loom-site/**.

## The one thing to know: docs live in `../loom`

This repo contains the *site* — design, layout, navigation, build. It contains **no
documentation of its own**. Every page under `/docs` is synced at build time from the sibling
[`loom`](https://github.com/chhetrisushil/loom) repository by `scripts/sync-docs.mjs`, and
`src/content/docs/` is gitignored as a build artifact.

That is deliberate. Docs are written and reviewed alongside the code they describe; a second
copy here would drift from the first, which is precisely the failure this project has hit in
every sibling repo.

```bash
# clone loom next to this repo
git clone git@github.com:chhetrisushil/loom.git ../loom

pnpm install
pnpm dev        # syncs docs, then serves at http://localhost:4321/loom-site/
pnpm build      # syncs docs, then emits dist/
```

`pnpm sync` alone refreshes the synced markdown. Point the sync at a checkout elsewhere with
`LOOM_REPO=/path/to/loom pnpm build`.

## Search

Full-text search over every documentation page, reachable from the header on any page or with
`/` (`⌘K`/`Ctrl-K` also works). No service, no API key, no network call off the site.

[Pagefind](https://pagefind.app) indexes the **built HTML** — so the index is generated after
`astro build`, by `scripts/index-search.mjs`, which `pnpm build` chains automatically. It ships a
chunked index: the browser downloads only the fragments a query actually touches, rather than
one JSON blob of every document up front. `src/components/Search.astro` drives Pagefind's JS
API directly and renders results in the site's own design tokens, so none of Pagefind's stock UI
bundles are published.

Two consequences worth knowing:

- **The index only exists after a build.** `scripts/index-search.mjs` therefore mirrors the
  bundle into `public/pagefind/` (gitignored) so `astro dev` serves it too. Run `pnpm build` once
  before `pnpm dev`, or search will report the index as unavailable. `pnpm index` alone
  re-indexes an existing `dist/`.
- **What is searchable is what carries `data-pagefind-body`** — currently the `<article>` in
  `src/pages/docs/[...slug].astro`, and nothing else. That is what keeps the landing page, the
  docs hub and the ADR index out of the results, and keeps the header, sidebar and footer from
  being indexed once per page. Results are filterable by the same sections the sidebar uses.

## Publication boundary — read before adding pages

`loom` is a **private** repository. This site is **public**, and everything it publishes is
indexable and cacheable by third parties.

`scripts/sync-docs.mjs` therefore publishes an **allowlist**, never a denylist:

| Published | Not published |
| --- | --- |
| The 15 curated top-level guides named in `PAGES` | `docs/requirements/` — internal evaluation and planning docs |
| `docs/adr/` — architectural decision records | `docs/presentation/` — talk decks and presenter notes |
| `docs/spec/` — the normative kernel specification | `docs/loom-2.0/` — historical working notes |

A new file added to `loom/docs` is **private by default** — it appears on the site only when
someone adds it to `PAGES` in the sync script. Keep it that way: an allowlist fails closed, a
denylist fails open.

The deploy workflow asserts this too, failing the build if `dist/docs/requirements` ever exists.

## Checks

`pnpm check` runs two things, and CI runs it after every build:

- **`astro check`** — types and component diagnostics.
- **`scripts/check-links.mjs`** — every internal `href` in the *built* `dist/` resolves to a page
  that was actually built.

The second exists because two link bugs shipped and nothing noticed. `astro check` never opens the
emitted HTML, and a markdown link is only text until it does: (1) synced doc links were written
without the `/loom-site` base, so 365 of them addressed a different repo's user site; (2) link
targets were derived from the source **filename** while Astro derives the route from a **slugified**
id, so every link to `0016-loom-2.0-…` pointed at a page that is never built. Both are invisible in
review and obvious the moment you read `dist/`.

## Deployment

`.github/workflows/deploy.yml` builds and deploys on every push to `main`, and can be triggered
manually or by a `docs-updated` repository dispatch from the loom repo.

Because the docs source is private, CI needs a token that can read it:

1. Create a fine-grained PAT with **`Contents: read`** on `chhetrisushil/loom`.
2. Add it to this repo as the secret **`LOOM_DOCS_TOKEN`**.
3. In **Settings → Pages**, set **Source: GitHub Actions**.

The workflow fails loudly if fewer than 50 pages build, or if fewer than 50 are indexed for
search — a site that deployed with no documentation is worse than one that failed to deploy, and
a search box that finds nothing reads as a broken site rather than a failed build.

## Structure

```
site.config.mjs              BASE — the deployment prefix, written once
scripts/sync-docs.mjs        the publication boundary + link rewriting
scripts/index-search.mjs     builds the Pagefind index over dist/, mirrors it into public/
scripts/check-links.mjs      asserts every internal link in dist/ resolves (part of `pnpm check`)
src/pages/index.astro        landing page
src/pages/docs/index.astro   docs hub
src/pages/docs/adr/index.astro   filterable index of the decision records
src/pages/docs/[...slug].astro   docs shell: sidebar, content, on-this-page rail
src/layouts/Base.astro       shell, theme bootstrap, footer
src/components/SiteHeader.astro  header, nav, theme toggle
src/components/Search.astro  search trigger + modal, driving the Pagefind JS API
src/styles/global.css        design tokens (dark-first, light is a real second theme)
```

## Changing the hosting URL

`site.config.mjs` holds `BASE`, and it is the **only** place the prefix is written: `astro.config.mjs`
imports it, and so does `scripts/sync-docs.mjs`, which has to prefix links itself because Astro does
not touch URLs written inside markdown. Serving from a user site or a custom domain is a one-line
change there (`""`), plus a `public/CNAME` for a custom domain. Everything else follows — the site
chrome reads `import.meta.env.BASE_URL`, and `scripts/check-links.mjs` fails the build if any emitted
link disagrees.

## Licence

Apache-2.0, matching Loom.
