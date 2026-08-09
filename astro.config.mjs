import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

// Project-site hosting: served from https://chhetrisushil.github.io/loom-site/, so every
// absolute path needs the base prefix. Astro handles that for `<a href>` written through
// `withBase()` and for its own asset URLs. Change `base` to "/" if this ever moves to a user
// site or a custom domain — that is the single switch.
export default defineConfig({
  site: "https://chhetrisushil.github.io",
  base: "/loom-site",
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
