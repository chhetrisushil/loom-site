import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

// Populated by `pnpm sync` from the sibling ../loom checkout — see scripts/sync-docs.mjs.
const docs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/docs" }),
  schema: z.object({
    title: z.string(),
    section: z.string(),
    order: z.number().default(0),
    source: z.string().optional(),
  }),
});

export const collections = { docs };
