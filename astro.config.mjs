import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import { BASE } from "./site.config.mjs";

// Project-site hosting: served from https://chhetrisushil.github.io/loom-site/, so every
// absolute path needs the base prefix. Astro applies it to its own asset URLs and to anything
// written through `import.meta.env.BASE_URL` — but NOT to links inside markdown content, which
// `scripts/sync-docs.mjs` prefixes itself from the same `BASE`. Change it in `site.config.mjs`;
// that is the single switch.
export default defineConfig({
  site: "https://chhetrisushil.github.io",
  base: BASE,
  trailingSlash: "ignore",
  integrations: [mdx(), sitemap()],
  markdown: {
    shikiConfig: {
      // Both themes are emitted as CSS variables per token (defaultColor: false means Shiki
      // writes no `color`), and global.css picks one from `data-theme`. A single theme would
      // be unreadable in the other mode — dark token colours on a light block.
      themes: { light: "github-light", dark: "github-dark-default" },
      defaultColor: false,
      wrap: false,
    },
  },
  build: { format: "directory" },
});
