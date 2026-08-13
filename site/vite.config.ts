import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type Plugin } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const deckSource = resolve(here, "../slides/slides.html");

/**
 * Copy the deck into the build, unchanged.
 *
 * The deck is one self-contained HTML file that has to keep working when you
 * open it straight off a laptop with no server. Rewriting it as a route would
 * take that away, so instead it is copied verbatim and linked to. One file,
 * one source of truth, still guarded by test/slides.test.ts.
 */
function copyDeck(): Plugin {
  return {
    name: "copy-deck",
    apply: "build",
    closeBundle() {
      const out = resolve(here, "../docs/slides.html");
      mkdirSync(dirname(out), { recursive: true });
      copyFileSync(deckSource, out);
    },
  };
}

/** Serve the deck at /slides.html while developing, straight off disk. */
function serveDeck(): Plugin {
  return {
    name: "serve-deck",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== "/slides.html") return next();
        res.setHeader("Content-Type", "text/html");
        res.end(readFileSync(deckSource));
      });
    },
  };
}

export default defineConfig({
  // Served from the root of talks.ezcorp.org, so no path prefix.
  base: "/",
  plugins: [svelte(), copyDeck(), serveDeck()],
  build: {
    outDir: resolve(here, "../docs"),
    emptyOutDir: true,
  },
});
