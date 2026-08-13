import { checkAnswer } from "./check.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import { decideLane, matchRule } from "./decide.ts";
import type { ModelClient } from "./clients/types.ts";
import {
  ESCALATION_PATH,
  type Attempt,
  type Lane,
  type ModelLane,
  type RouteCard,
  type RouteDecision,
  type RouterConfig,
} from "./types.ts";

/** Throw the standard cancellation error if the caller has already given up. */
function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const err = new Error("The request was cancelled");
  err.name = "AbortError";
  throw err;
}

/** The next stronger lane, or null if we are already at the top. */
export function nextLaneUp(lane: Lane): ModelLane | null {
  const i = (ESCALATION_PATH as readonly string[]).indexOf(lane);
  if (i === -1) return null;
  const next = ESCALATION_PATH[i + 1];
  return next ?? null;
}

export interface RouteOptions {
  /** The models and rules to route with. Defaults to the ones in the slides. */
  config?: RouterConfig;
  /** Called after each attempt, so a UI can show progress as it happens. */
  onAttempt?: (attempt: Attempt) => void;
  /** Called once the lane is chosen, before any answering model is called. */
  onDecision?: (card: Pick<RouteCard, "decision">) => void;
  signal?: AbortSignal;
}

/**
 * Run one request through the whole pipeline.
 *
 *   choose a lane -> call the model -> check the answer
 *                          ^                    |
 *                          |____ if it failed, try the next lane up
 *
 * Returns a route card describing everything that happened, which is what the
 * UI renders and what you would log to learn from later.
 */
export async function route(
  prompt: string,
  client: ModelClient,
  options: RouteOptions = {},
): Promise<RouteCard> {
  const { config = DEFAULT_CONFIG, onAttempt, onDecision, signal } = options;

  // Bail out straight away if the caller already cancelled. Without this, an
  // abort that lands before the first await is silently ignored, and a client
  // that only listens for the abort event would wait forever.
  throwIfAborted(signal);

  const decision = await decideLane(prompt, client, { config, signal });
  onDecision?.({ decision });

  // HOLD means we send nothing at all. There is no model call to make, and
  // that is the correct outcome rather than a failure.
  if (decision.lane === "HOLD") {
    return {
      prompt,
      decision,
      attempts: [],
      finalLane: "HOLD",
      text: "",
      cost: 0,
      held: true,
    };
  }

  const attempts: Attempt[] = [];
  let lane: ModelLane = decision.lane as ModelLane;

  for (;;) {
    throwIfAborted(signal);
    const laneConfig = config.lanes[lane];
    const model = laneConfig.model!;

    const { text, seconds } = await client.generate({
      model,
      prompt,
      maxTokens: laneConfig.maxTokens,
      signal,
    });

    const attempt: Attempt = { lane, model, text, seconds, check: checkAnswer(prompt, text) };
    attempts.push(attempt);
    onAttempt?.(attempt);

    if (attempt.check.ok) break;

    const up = nextLaneUp(lane);
    if (!up) break; // Already at the strongest lane, so this is the best we have.
    lane = up;
  }

  const last = attempts[attempts.length - 1]!;
  return {
    prompt,
    decision,
    attempts,
    finalLane: last.lane,
    text: last.text,
    cost: attempts.reduce((sum, a) => sum + config.lanes[a.lane].cost, 0),
    held: false,
  };
}

/**
 * Work out the lane without calling an answering model.
 *
 * Useful for a UI that wants to show the decision instantly while the answer
 * is still loading, and for trying out new rules cheaply.
 *
 * One honest note: if no rule matches, the chooser still runs, because
 * that IS the decision. Only the mock client is completely free.
 */
export async function explain(
  prompt: string,
  client: ModelClient,
  options: RouteOptions = {},
): Promise<RouteDecision> {
  const { config = DEFAULT_CONFIG, signal } = options;
  return decideLane(prompt, client, { config, signal });
}

/**
 * Which rule would catch this request, without calling anything at all.
 *
 * This is what the website runs on every keystroke. It never touches the
 * network, so it costs nothing and answers instantly, and it is the part that
 * actually teaches: you watch the lane change as you type. When no rule
 * matches it says so, rather than pretending, because at that point the real
 * router would have to pay the chooser to decide.
 */
export function previewDecision(prompt: string, config: RouterConfig = DEFAULT_CONFIG): Preview {
  if (!prompt.trim()) return { kind: "empty" };

  const policy = matchRule(config.policyRules, prompt);
  if (policy) {
    return {
      kind: "rule",
      lane: policy.rule.lane,
      reason: policy.rule.reason,
      ruleSet: "policy",
      pattern: policy.pattern.source,
    };
  }

  const task = matchRule(config.taskRules, prompt);
  if (task) {
    return {
      kind: "rule",
      lane: task.rule.lane,
      reason: task.rule.reason,
      ruleSet: "task",
      pattern: task.pattern.source,
    };
  }

  if (prompt.length > config.longRequestChars) {
    return {
      kind: "length",
      lane: "QUALITY",
      reason: `Longer than ${config.longRequestChars} characters, so there is more to keep straight`,
      over: config.longRequestChars,
    };
  }

  return { kind: "classifier", model: config.classifierModel };
}

/** What the preview found. Deliberately not a RouteDecision: nothing has run. */
export type Preview =
  | { kind: "empty" }
  | { kind: "rule"; lane: Lane; reason: string; ruleSet: "policy" | "task"; pattern: string }
  | { kind: "length"; lane: Lane; reason: string; over: number }
  | { kind: "classifier"; model: string };
