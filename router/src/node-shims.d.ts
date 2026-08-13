/**
 * Minimal declarations for the few runtime globals cli.ts uses.
 *
 * Normally you would get these from `@types/node` or `@types/bun`. This file
 * only exists so `tsc --noEmit` passes in an environment without those
 * packages installed. Install the real types and delete this file.
 *
 * Nothing under src/router uses any of this. The core is plain TypeScript with
 * no runtime dependencies, which is why it runs in a browser unchanged.
 */

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

interface Console {
  /** Bun exposes stdin as an async iterable of lines on `console`. */
  [Symbol.asyncIterator](): AsyncIterableIterator<string>;
}
