// The one place the deployment base path is written.
//
// The site is a GitHub *project* site (https://chhetrisushil.github.io/loom-site/), so every
// absolute in-page URL needs this prefix. Astro applies it to its own asset URLs and to anything
// written through `import.meta.env.BASE_URL` — but NOT to links inside markdown content, which
// `scripts/sync-docs.mjs` rewrites before Astro ever sees them. That script therefore has to
// prefix them itself, and it must use the SAME value as `astro.config.mjs` or the two silently
// disagree: that is exactly how 365 in-content links shipped pointing at
// `chhetrisushil.github.io/docs/…` (a different repo's user site) instead of
// `chhetrisushil.github.io/loom-site/docs/…`.
//
// Moving to a user site or a custom domain is a one-line change here — no trailing slash, or `""`
// for a root deployment.
export const BASE = "/loom-site";
