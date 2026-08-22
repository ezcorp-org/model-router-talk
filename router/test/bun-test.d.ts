/**
 * Minimal type declarations for `bun:test`.
 *
 * Normally you would get these from `@types/bun`. This file only exists so
 * `tsc --noEmit` passes in an environment without that package installed.
 * If you add `@types/bun` to the project, you can delete this file.
 */
declare module "bun:test" {
  export function test(name: string, fn: () => unknown | Promise<unknown>): void;
  export function describe(name: string, fn: () => void): void;

  interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeGreaterThan(n: number): void;
    toContain(item: unknown): void;
    toThrow(expected?: unknown): void;
    toBeInstanceOf(expected: unknown): void;
    toBeTruthy(): void;
    not: Matchers;
    rejects: Matchers;
  }
  export function expect(actual: unknown): Matchers;
}
