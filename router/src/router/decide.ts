import { firstJsonBlock } from "./check.ts";
import { DEFAULT_CONFIG } from "./config.ts";
import type { ModelClient } from "./clients/types.ts";
import type { Lane, RouteDecision, RouterConfig, Rule } from "./types.ts";

export interface DecideOptions {
  /** The models and rules to route with. Defaults to the ones in the slides. */
  config?: RouterConfig;
  signal?: AbortSignal;
}

/** First rule whose pattern matches, or null. */
export function matchRule(
  rules: Rule[],
  prompt: string,
): { rule: Rule; pattern: RegExp } | null {
  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      // Patterns are reused across calls, so never use the /g flag on them.
      if (pattern.test(prompt)) return { rule, pattern };
    }
  }
  return null;
}

/** The lanes the chooser is allowed to pick. HOLD is never one of them. */
const CHOOSABLE = ["PREMIUM", "QUALITY", "FAST"] as const;

/**
 * Turn the chooser's reply into a lane.
 *
 * The chooser is asked for JSON against a schema, so the ordinary path is one
 * `JSON.parse` and a look at `lane`. Everything after that is for when the
 * model ignored the schema: JSON Mode is not supported on every model, and
 * Cloudflare's own docs say it can fail on harder requests, so a reply that is
 * not JSON has to be survivable rather than fatal.
 */
export function parseClassifierReply(reply: string): Lane | null {
  return fromJson(reply) ?? fromProse(reply);
}

/** The normal path: the model answered with the shape it was given. */
function fromJson(reply: string): Lane | null {
  const block = firstJsonBlock(reply);
  if (!block) return null;
  try {
    const parsed = JSON.parse(block) as { lane?: unknown };
    const lane = String(parsed?.lane ?? "").toUpperCase();
    return (CHOOSABLE as readonly string[]).includes(lane) ? (lane as Lane) : null;
  } catch {
    return null;
  }
}

/**
 * The fallback: the model wrote a sentence.
 *
 * Two rules, both learned the hard way. Match on word boundaries, so `FASTEST`
 * is not read as `FAST`. And ignore a lane name that is being denied: a reply
 * of "this is not PREMIUM, so FAST" means FAST, but a plain search finds
 * PREMIUM first and routes it at twenty times the cost. Getting that backwards
 * is expensive in exactly the case the router exists to keep cheap.
 *
 * When a reply genuinely names two lanes and denies neither, the stronger one
 * wins. That bias is deliberate: being too careful costs money, being too
 * casual costs a wrong answer nobody notices.
 */
function fromProse(reply: string): Lane | null {
  const upper = reply.toUpperCase();
  for (const lane of CHOOSABLE) {
    for (const match of upper.matchAll(new RegExp(`\\b${lane}\\b`, "g"))) {
      if (!isDenied(upper, match.index ?? 0)) return lane;
    }
  }
  return null;
}

/** True when the words just before this position rule the lane out. */
function isDenied(upper: string, at: number): boolean {
  // Enough room for "is not a ", "isn't ", "rather than ", and similar.
  const before = upper.slice(Math.max(0, at - 24), at);
  return /\b(NOT|NEITHER|NEVER|RATHER THAN|INSTEAD OF|N'T)\b[^.!?]*$/.test(before);
}

/**
 * Decide which lane handles this request, without calling the answering model.
 *
 * The order is the whole lesson:
 *   1. safety rules   free, always behave the same, a teammate can read them
 *   2. job type rules also free
 *   3. length check   free
 *   4. the chooser    costs a little, only for what the rules missed
 *
 * Rules run first because you do not want any model deciding how careful to be
 * about someone's password, or whether private text is safe to send. That is
 * also why HOLD is not in the chooser's schema: it cannot pick it, so keeping
 * something private stays a decision a person wrote down.
 */
export async function decideLane(
  prompt: string,
  client: ModelClient,
  options: DecideOptions = {},
): Promise<RouteDecision> {
  const { config = DEFAULT_CONFIG, signal } = options;

  const policy = matchRule(config.policyRules, prompt);
  if (policy) {
    return {
      lane: policy.rule.lane,
      reason: policy.rule.reason,
      mechanism: { kind: "policy", pattern: policy.pattern.source },
      classifierSeconds: 0,
    };
  }

  const task = matchRule(config.taskRules, prompt);
  if (task) {
    return {
      lane: task.rule.lane,
      reason: task.rule.reason,
      mechanism: { kind: "task", pattern: task.pattern.source },
      classifierSeconds: 0,
    };
  }

  if (prompt.length > config.longRequestChars) {
    return {
      lane: "QUALITY",
      reason: `Long request, over ${config.longRequestChars} characters, so there is more to keep straight`,
      mechanism: { kind: "length", over: config.longRequestChars },
      classifierSeconds: 0,
    };
  }

  // Nothing matched, so pay a small amount to have the chooser decide.
  try {
    const { text, seconds } = await client.generate({
      model: config.classifierModel,
      prompt: `Request:\n${prompt}\n\nWhich lane should handle this?`,
      system: config.classifierSystem,
      jsonSchema: config.classifierSchema,
      temperature: 0,
      // Room for {"lane": "PREMIUM"} and a little slack. Too tight and the
      // JSON is cut off mid-object and cannot parse.
      maxTokens: 32,
      signal,
    });

    const lane = parseClassifierReply(text);
    if (lane) {
      return {
        lane,
        reason: `The chooser read the request and picked ${lane}`,
        mechanism: { kind: "classifier", model: config.classifierModel, reply: text },
        classifierSeconds: seconds,
      };
    }
    return {
      lane: "QUALITY",
      reason: "The chooser gave an unusable answer, so we use the middle option",
      mechanism: { kind: "classifier", model: config.classifierModel, reply: text },
      classifierSeconds: seconds,
    };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    // If the chooser itself fails, do not drop the request. Take the middle
    // lane and say so on the card.
    return {
      lane: "QUALITY",
      reason: "The chooser could not be reached, so we use the middle option",
      mechanism: { kind: "fallback" },
      classifierSeconds: 0,
    };
  }
}
