/**
 * Turning rules the visitor typed into rules the router can use.
 *
 * The website lets people write their own routing rules, which means patterns
 * arrive as text from a box rather than as code a reviewer read. Everything
 * here exists to make that safe and to explain what went wrong in words a
 * person can act on.
 */

import { LANES } from "./config.ts";
import type { Lane, Rule, RouterConfig, SerializedRule, SerializedRouterConfig } from "./types.ts";

/** A pattern we would not accept, with a reason written for a person. */
export class RuleError extends Error {
  /** The pattern that caused it, so the UI can point at the right box. */
  readonly pattern: string;

  constructor(message: string, pattern: string) {
    super(message);
    this.name = "RuleError";
    this.pattern = pattern;
  }
}

/**
 * Longest pattern we accept.
 *
 * Not a security boundary. A slow pattern only ever hangs the tab of the person
 * who wrote it, on their own machine, so this is a guard rail rather than a
 * defence. It mostly catches someone pasting a whole file into the box.
 */
export const MAX_PATTERN_LENGTH = 200;

const LANE_NAMES = Object.keys(LANES) as Lane[];

/** Matches someone typing a full regex literal, slashes and all. */
const LOOKS_DELIMITED = /^\/(.*)\/([a-z]*)$/s;

/**
 * Check one pattern and turn it into a RegExp.
 *
 * Always case insensitive, and never global. Every rule in the default config
 * is written case insensitive, so matching that is the least surprising thing
 * to do. Global is refused outright: a global regex remembers where it stopped
 * last time, so a shared one matches every other request and the routing starts
 * flickering in a way that is very hard to spot. There is already a test that
 * no built in rule uses it; this is the same guarantee for rules people write.
 */
export function compilePattern(source: string): RegExp {
  const trimmed = source.trim();

  if (!trimmed) {
    throw new RuleError("This pattern is empty, so it would match everything.", source);
  }

  if (trimmed.length > MAX_PATTERN_LENGTH) {
    throw new RuleError(
      `This pattern is ${trimmed.length} characters. Keep it under ${MAX_PATTERN_LENGTH}.`,
      source,
    );
  }

  const delimited = LOOKS_DELIMITED.exec(trimmed);
  if (delimited) {
    const flags = delimited[2] ?? "";
    if (flags.includes("g")) {
      throw new RuleError(
        "Drop the slashes and the g. A global pattern remembers where it stopped last " +
          "time, so it would match every other request instead of every one.",
        source,
      );
    }
    throw new RuleError(
      "Write the pattern on its own, without the surrounding slashes. " +
        `Try ${delimited[1]} instead.`,
      source,
    );
  }

  try {
    return new RegExp(trimmed, "i");
  } catch (err) {
    throw new RuleError(
      `That is not a valid pattern: ${(err as Error).message}`,
      source,
    );
  }
}

function assertLane(lane: string, pattern: string): Lane {
  if (!(LANE_NAMES as string[]).includes(lane)) {
    throw new RuleError(
      `${lane} is not a lane. Pick one of ${LANE_NAMES.join(", ")}.`,
      pattern,
    );
  }
  return lane as Lane;
}

/** Turn a stored rule into one the router can run. Throws RuleError. */
export function compileRule(rule: SerializedRule): Rule {
  if (rule.patterns.length === 0) {
    throw new RuleError("A rule needs at least one pattern.", "");
  }
  return {
    lane: assertLane(rule.lane, rule.patterns[0] ?? ""),
    reason: rule.reason,
    patterns: rule.patterns.map(compilePattern),
  };
}

/**
 * A pattern, written the way you would say it out loud.
 *
 * `\bpull\b[^.?!]*\bout of\b` is precise and unreadable. On a route card, what
 * matters is which words caught the request, not the syntax that caught them,
 * so the card gets `pull … out of` and the editor keeps the real thing.
 *
 * This only tidies. It never changes what a pattern means, and anything it does
 * not recognise is left exactly as it was rather than guessed at.
 */
export function describePattern(source: string): string {
  return (
    source
      // Word boundaries are noise: they are what makes "cat" not match
      // "category", which is the behaviour a reader already assumes.
      .replaceAll("\\b", "")
      // "anything up to the end of the sentence" is a gap, so draw a gap.
      .replace(/\[\^\.\?!\]\*/g, " … ")
      // An escaped literal is just that literal.
      .replace(/\\([.?!/-])/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Turn a running rule back into something we can store. */
export function serializeRule(rule: Rule): SerializedRule {
  return {
    lane: rule.lane,
    reason: rule.reason,
    patterns: rule.patterns.map((p) => p.source),
  };
}

/** Compile a whole stored config. Throws RuleError on the first bad pattern. */
export function compileConfig(config: SerializedRouterConfig): RouterConfig {
  return {
    lanes: config.lanes,
    policyRules: config.policyRules.map(compileRule),
    taskRules: config.taskRules.map(compileRule),
    longRequestChars: config.longRequestChars,
    classifierModel: config.classifierModel,
    classifierSystem: config.classifierSystem,
    classifierSchema: config.classifierSchema,
  };
}

/** Turn a running config into something we can store. */
export function serializeConfig(config: RouterConfig): SerializedRouterConfig {
  return {
    lanes: config.lanes,
    policyRules: config.policyRules.map(serializeRule),
    taskRules: config.taskRules.map(serializeRule),
    longRequestChars: config.longRequestChars,
    classifierModel: config.classifierModel,
    classifierSystem: config.classifierSystem,
    classifierSchema: config.classifierSchema,
  };
}
