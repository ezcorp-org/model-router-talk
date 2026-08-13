/**
 * Shared types for the model router.
 *
 * The names here match the workshop slides on purpose. FAST, QUALITY and
 * PREMIUM are the three models we can send work to. HOLD is the option that
 * sends nothing anywhere.
 */

import type { JsonSchema } from "./clients/types.ts";

/** The four choices the router can make. */
export type Lane = "FAST" | "QUALITY" | "PREMIUM" | "HOLD";

/** The three lanes that actually call a model, in order from cheap to strong. */
export const ESCALATION_PATH = ["FAST", "QUALITY", "PREMIUM"] as const;

/** A lane that has a model behind it. */
export type ModelLane = (typeof ESCALATION_PATH)[number];

export interface LaneConfig {
  /** The Cloudflare Workers AI model name, or null for HOLD. */
  model: string | null;
  /** One line describing what this lane is for. */
  blurb: string;
  /**
   * What one request costs, in whole cents.
   *
   * Made up, and chosen so the gap between the lanes is about the size of the
   * real one. Cents rather than dollars so the arithmetic stays exact.
   */
  cost: number;
  /** Longest answer we will ask for, so one request cannot drain the quota. */
  maxTokens: number;
}

/** How the router arrived at its choice. */
export type Mechanism =
  | { kind: "policy"; pattern: string }
  | { kind: "task"; pattern: string }
  | { kind: "length"; over: number }
  /**
   * The chooser decided. `reply` is its answer, word for word.
   *
   * Kept because "a model decided" is the one step on the card a reader has to
   * take on trust. Showing the actual `{"lane":"FAST"}` turns it into something
   * they can see: the model is held to a shape, and the code reads one field.
   */
  | { kind: "classifier"; model: string; reply?: string }
  | { kind: "fallback" };

/** The decision, before any model has been called. */
export interface RouteDecision {
  lane: Lane;
  /** Plain English reason, safe to show a user. */
  reason: string;
  mechanism: Mechanism;
  /** Seconds spent asking the small model, 0 if a rule decided it. */
  classifierSeconds: number;
}

/** The result of checking an answer. */
export interface CheckResult {
  ok: boolean;
  note: string;
}

/** One call to one model. */
export interface Attempt {
  lane: ModelLane;
  model: string;
  text: string;
  seconds: number;
  check: CheckResult;
}

/**
 * Everything that happened for one request. This is the object the UI renders
 * as a route card, and the same shape the Python version used to print.
 */
export interface RouteCard {
  prompt: string;
  decision: RouteDecision;
  /** Empty when the lane was HOLD, because nothing was sent. */
  attempts: Attempt[];
  /** The lane that produced the final answer, or HOLD. */
  finalLane: Lane;
  /** The answer we would show the user. Empty string for HOLD. */
  text: string;
  /** Added up cost across every attempt, in cents. */
  cost: number;
  /** True when nothing left the browser. */
  held: boolean;
}

/** One rule: if any pattern matches, send it to this lane for this reason. */
export interface Rule {
  lane: Lane;
  reason: string;
  patterns: RegExp[];
}

/**
 * A rule in a form that survives being written to storage and read back.
 *
 * A RegExp cannot round trip through JSON, so the website keeps rules in this
 * shape and compiles them on the way in. Patterns are the source text only, no
 * delimiters and no flags: the flags are ours to decide, not the visitor's.
 */
export interface SerializedRule {
  lane: Lane;
  reason: string;
  patterns: string[];
}

/**
 * Everything the routing decision depends on.
 *
 * This exists so the choice of models and rules is a value you can hold, edit
 * and pass around, rather than a set of module constants nobody can reach. The
 * deck makes the argument that the model list is a setting rather than code.
 * This is the type that makes that true.
 */
export interface RouterConfig {
  lanes: Record<Lane, LaneConfig>;
  /** Safety rules. Run first and win outright. */
  policyRules: Rule[];
  /** Job type rules. Run after safety, before the small model. */
  taskRules: Rule[];
  /** Requests longer than this go to QUALITY without asking the small model. */
  longRequestChars: number;
  /** The model that picks a lane when no rule matched. */
  classifierModel: string;
  /** What we tell that model. */
  classifierSystem: string;
  /** The shape it must answer in, when the provider can enforce one. */
  classifierSchema: JsonSchema;
}

/** The same shape, ready to be stored as JSON. */
export interface SerializedRouterConfig {
  lanes: Record<Lane, LaneConfig>;
  policyRules: SerializedRule[];
  taskRules: SerializedRule[];
  longRequestChars: number;
  classifierModel: string;
  classifierSystem: string;
  classifierSchema: JsonSchema;
}
