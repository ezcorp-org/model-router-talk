/**
 * A small model router.
 *
 * The core is pure logic with no network access and no dependencies, so the
 * same code runs in a browser, in a Cloudflare Worker, in Node and in Bun.
 * Anything that touches the network goes through the ModelClient interface.
 *
 * Quick start:
 *
 *   import { route, MockClient } from "./router/index.ts";
 *   const card = await route("Summarise these notes", new MockClient());
 *   console.log(card.finalLane, card.text);
 */

export * from "./types.ts";
export * from "./config.ts";
export * from "./check.ts";
export * from "./decide.ts";
export * from "./route.ts";
export * from "./rules.ts";
export * from "./money.ts";
export * from "./clients/types.ts";
export { MockClient } from "./clients/mock.ts";
export { WorkersAIClient, type WorkersAIOptions } from "./clients/workersai.ts";

import { LANES } from "./config.ts";
import { describePattern } from "./rules.ts";
import type { Lane, Mechanism } from "./types.ts";

/**
 * One plain sentence saying why a request went where it did.
 *
 * This replaces what used to be two lines on the card, "Because" and "Reason",
 * which sat next to each other saying almost the same thing in two registers.
 * One line, in words, is easier to read and harder to misread.
 */
export function describeMechanism(m: Mechanism, reason?: string): string {
  const because = (() => {
    switch (m.kind) {
      case "policy":
        return `A safety rule spotted “${describePattern(m.pattern)}”`;
      case "task":
        return `A job type rule spotted “${describePattern(m.pattern)}”`;
      case "length":
        return `The request is longer than ${m.over} characters`;
      case "classifier":
        // Not "the chooser picked": the reason that follows already says that,
        // and on the card the two sat next to each other saying it twice.
        return "No rule matched, so a model was asked";
      case "fallback":
        return "No rule matched and the chooser could not be reached";
    }
  })();
  return reason ? `${because}. ${reason}.` : `${because}.`;
}

/**
 * The "Because" line the route cards print, or nothing when the reason beside
 * it would only say the same thing again.
 *
 * Only a rule earns the line. The reason says why that lane; this says which
 * words got it there, which is the one thing a reason never carries. The length
 * step and the chooser both already explain themselves, and printing both put
 * one sentence on the card twice. A router with no rules prints one row fewer.
 */
export function describeRuleMatch(m: Mechanism): string | undefined {
  return m.kind === "policy" || m.kind === "task" ? describeMechanism(m) : undefined;
}

/** The colour each lane uses in the slides, so the UI can match. */
export const LANE_COLOURS: Record<Lane, string> = {
  FAST: "#3B9EF5",
  QUALITY: "#2DBD72",
  PREMIUM: "#EEC216",
  HOLD: "#B0ACA6",
};

/** Lanes in display order, with their settings. Handy for building a legend. */
export const LANE_LIST = (Object.keys(LANES) as Lane[]).map((lane) => ({
  lane,
  ...LANES[lane],
  colour: LANE_COLOURS[lane],
}));
