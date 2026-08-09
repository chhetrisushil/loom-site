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

## Deployment

`.github/workflows/deploy.yml` builds and deploys on every push to `main`, and can be triggered
manually or by a `docs-updated` repository dispatch from the loom repo.

Because the docs source is private, CI needs a token that can read it:

1. Create a fine-grained PAT with **`Contents: read`** on `chhetrisushil/loom`.
2. Add it to this repo as the secret **`LOOM_DOCS_TOKEN`**.
3. In **Settings → Pages**, set **Source: GitHub Actions**.

The workflow fails loudly if fewer than 50 pages build — a site that deployed with no
documentation is worse than one that failed to deploy.

## Structure

```
scripts/sync-docs.mjs        the publication boundary + link rewriting
src/pages/index.astro        landing page
src/pages/docs/index.astro   docs hub
src/pages/docs/adr/index.astro   filterable index of the decision records
src/pages/docs/[...slug].astro   docs shell: sidebar, content, on-this-page rail
src/layouts/Base.astro       shell, theme bootstrap, footer
src/components/SiteHeader.astro  header, nav, theme toggle
src/styles/global.css        design tokens (dark-first, light is a real second theme)
```

## Changing the hosting URL

`astro.config.mjs` holds `site` and `base`. Serving from a user site or a custom domain is a
one-line change to `base` (`"/"`), plus a `public/CNAME` for a custom domain.

## Licence

Apache-2.0, matching Loom.
