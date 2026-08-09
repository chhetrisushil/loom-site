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
    shikiConfig: { theme: "github-dark-default", wrap: false },
  },
  build: { format: "directory" },
});
