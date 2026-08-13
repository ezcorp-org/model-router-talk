import { test, expect, describe } from "bun:test";
import {
  MockClient,
  checkAnswer,
  decideLane,
  explain,
  firstJsonBlock,
  matchRule,
  nextLaneUp,
  parseClassifierReply,
  route,
  POLICY_RULES,
  TASK_RULES,
  LANES,
  type ModelClient,
  type GenerateRequest,
  type GenerateResult,
} from "../src/router/index.ts";

/** Mock with no delay, so tests run fast. */
const fast = () => new MockClient(0);

/** A client that returns whatever you tell it to, for testing edge cases. */
class ScriptedClient implements ModelClient {
  readonly label = "scripted";
  readonly sendsData = false;
  calls: GenerateRequest[] = [];
  constructor(private replies: string[]) {}
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    this.calls.push(req);
    const text = this.replies.shift() ?? "";
    return { text, seconds: 0 };
  }
}

describe("rules", () => {
  test("safety rules beat job type rules", async () => {
    // "extract" is a FAST job rule, but "salary" is a HOLD safety rule.
    // Safety runs first, so nothing gets sent.
    const d = await decideLane("Extract the salary bands from this doc", fast());
    expect(d.lane).toBe("HOLD");
    expect(d.mechanism.kind).toBe("policy");
  });

  test("private topics are held back and never sent", async () => {
    for (const p of [
      "Review this patient intake form",
      "Is this GDPR compliant?",
      "Summarise the confidential merger notes",
    ]) {
      expect((await decideLane(p, fast())).lane).toBe("HOLD");
    }
  });

  test("security and payments go to the strongest lane", async () => {
    for (const p of [
      "Design a secure account recovery flow",
      "How should we store an OAuth token?",
      "Add a payment retry to checkout",
    ]) {
      expect((await decideLane(p, fast())).lane).toBe("PREMIUM");
    }
  });

  test("simple jobs go to the cheap lane", async () => {
    const d = await decideLane("Extract the action items from these notes", fast());
    expect(d.lane).toBe("FAST");
    expect(d.mechanism.kind).toBe("task");
  });

  test("very long requests skip the classifier", async () => {
    const d = await decideLane("z".repeat(1200), fast());
    expect(d.lane).toBe("QUALITY");
    expect(d.mechanism.kind).toBe("length");
    expect(d.classifierSeconds).toBe(0);
  });

  test("rules are free, so the classifier is never called for them", async () => {
    const scripted = new ScriptedClient([]);
    await decideLane("Extract the action items", scripted);
    expect(scripted.calls.length).toBe(0);
  });

  test("the classifier only runs when no rule matches", async () => {
    const scripted = new ScriptedClient(["QUALITY"]);
    const d = await decideLane("Tell me about badgers", scripted);
    expect(scripted.calls.length).toBe(1);
    expect(d.mechanism.kind).toBe("classifier");
    expect(d.lane).toBe("QUALITY");
  });

  test("patterns have no /g flag, so repeated matching stays reliable", () => {
    // A /g regex keeps lastIndex between calls and would match every other
    // time. This is a real bug that only shows up on the second request.
    for (const rule of [...POLICY_RULES, ...TASK_RULES]) {
      for (const p of rule.patterns) expect(p.global).toBe(false);
    }
    const prompt = "Extract the action items";
    expect(matchRule(TASK_RULES, prompt)).not.toBeNull();
    expect(matchRule(TASK_RULES, prompt)).not.toBeNull();
    expect(matchRule(TASK_RULES, prompt)).not.toBeNull();
  });
});

describe("the classifier reply", () => {
  test("reads a lane out of a chatty answer", () => {
    expect(parseClassifierReply("FAST")).toBe("FAST");
    expect(parseClassifierReply("  quality  ")).toBe("QUALITY");
    expect(parseClassifierReply("Sure! I would say PREMIUM.")).toBe("PREMIUM");
  });

  test("returns null when there is no lane in the reply", () => {
    expect(parseClassifierReply("I am not sure")).toBeNull();
    expect(parseClassifierReply("")).toBeNull();
  });

  test("falls back to the middle lane on an unclear reply", async () => {
    const d = await decideLane("Tell me about badgers", new ScriptedClient(["banana"]));
    expect(d.lane).toBe("QUALITY");
  });

  test("keeps working if the classifier itself fails", async () => {
    const broken: ModelClient = {
      label: "broken",
      sendsData: false,
      async generate() {
        throw new Error("network down");
      },
    };
    const d = await decideLane("Tell me about badgers", broken);
    expect(d.lane).toBe("QUALITY");
    expect(d.mechanism.kind).toBe("fallback");
  });
});

describe("checking answers", () => {
  test("rejects answers that are too short", () => {
    expect(checkAnswer("hi", "ok").ok).toBe(false);
  });

  test("rejects a refusal", () => {
    const r = checkAnswer("Write a plan", "I cannot help with that request at all, sorry about this.");
    expect(r.ok).toBe(false);
  });

  test("rejects an answer cut off mid sentence", () => {
    const r = checkAnswer("Explain", "word ".repeat(60) + "and then the system will");
    expect(r.ok).toBe(false);
    expect(r.note).toContain("cut off");
  });

  test("accepts a normal answer", () => {
    expect(checkAnswer("Explain", "This is a complete sentence that ends properly.").ok).toBe(true);
  });

  test("when JSON is asked for, it has to parse", () => {
    expect(checkAnswer("give me json", 'Here you go: {"a": 1, "b": [2, 3]} enjoy').ok).toBe(true);
    expect(checkAnswer("give me json", "Here you go: {a: 1, b: 2,} enjoy").ok).toBe(false);
    expect(checkAnswer("give me json", "I could not produce that for you today.").ok).toBe(false);
  });
});

describe("finding the JSON in a reply", () => {
  test("handles nesting, which a simple regex gets wrong", () => {
    const text = 'prefix {"a": {"b": [1, 2]}, "c": 3} suffix';
    expect(firstJsonBlock(text)).toBe('{"a": {"b": [1, 2]}, "c": 3}');
  });

  test("ignores brackets inside strings", () => {
    const text = '{"note": "this } is not the end", "ok": true}';
    expect(JSON.parse(firstJsonBlock(text)!)).toEqual({ note: "this } is not the end", ok: true });
  });

  test("handles escaped quotes inside strings", () => {
    const text = '{"note": "he said \\"hi\\" }", "ok": true}';
    expect(JSON.parse(firstJsonBlock(text)!)).toEqual({ note: 'he said "hi" }', ok: true });
  });

  test("handles arrays and returns null when there is nothing", () => {
    expect(firstJsonBlock("see [1, [2, 3]] here")).toBe("[1, [2, 3]]");
    expect(firstJsonBlock("no json at all")).toBeNull();
    expect(firstJsonBlock("unclosed {oops")).toBeNull();
  });
});

describe("moving up a lane", () => {
  test("knows the order and stops at the top", () => {
    expect(nextLaneUp("FAST")).toBe("QUALITY");
    expect(nextLaneUp("QUALITY")).toBe("PREMIUM");
    expect(nextLaneUp("PREMIUM")).toBeNull();
    expect(nextLaneUp("HOLD")).toBeNull();
  });

  test("a failed check moves the work up, and the cost adds up", async () => {
    // The mock deliberately returns broken JSON from the small model, which
    // is what lets the demo show a check failing for real.
    const card = await route("Return the settings as JSON", fast());
    expect(card.attempts.length).toBeGreaterThan(1);
    expect(card.attempts[0]!.lane).toBe("FAST");
    expect(card.attempts[0]!.check.ok).toBe(false);
    expect(card.finalLane).toBe("QUALITY");
    expect(card.cost).toBe(LANES.FAST.cost + LANES.QUALITY.cost);
  });

  test("gives up at the top lane instead of looping forever", async () => {
    const scripted = new ScriptedClient(["PREMIUM", "no", "no", "no", "no"]);
    const card = await route("Tell me about badgers", scripted);
    expect(card.finalLane).toBe("PREMIUM");
    expect(card.attempts.length).toBe(1);
  });
});

describe("the whole pipeline", () => {
  test("HOLD sends nothing at all", async () => {
    const scripted = new ScriptedClient(["FAST", "an answer"]);
    const card = await route("Summarise the confidential salary review", scripted);
    expect(card.held).toBe(true);
    expect(card.finalLane).toBe("HOLD");
    expect(card.attempts).toEqual([]);
    expect(card.text).toBe("");
    expect(card.cost).toBe(0);
    // The important part: not a single call was made.
    expect(scripted.calls.length).toBe(0);
  });

  test("a simple request costs one unit and one call", async () => {
    const card = await route("Extract the action items from these notes", fast());
    expect(card.finalLane).toBe("FAST");
    expect(card.attempts.length).toBe(1);
    expect(card.cost).toBe(1);
    expect(card.text.length).toBeGreaterThan(0);
  });

  test("reports progress as it goes", async () => {
    const seen: string[] = [];
    await route("Return the settings as JSON", fast(), {
      onDecision: (d) => seen.push("decision:" + d.decision.lane),
      onAttempt: (a) => seen.push("attempt:" + a.lane),
    });
    expect(seen[0]).toBe("decision:FAST");
    expect(seen).toContain("attempt:FAST");
    expect(seen).toContain("attempt:QUALITY");
  });

  test("explain works out the lane without answering", async () => {
    const scripted = new ScriptedClient([]);
    const d = await explain("Design a secure login flow", scripted);
    expect(d.lane).toBe("PREMIUM");
    expect(scripted.calls.length).toBe(0);
  });

  test("can be cancelled", async () => {
    const ctrl = new AbortController();
    const slow: ModelClient = {
      label: "slow",
      sendsData: false,
      generate: (req) =>
        new Promise((_, reject) => {
          const fail = () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          };
          // Handle the signal already being aborted, not just a later abort.
          if (req.signal?.aborted) return fail();
          req.signal?.addEventListener("abort", fail);
        }),
    };
    ctrl.abort();
    let threw = false;
    try {
      await route("Extract the notes", slow, { signal: ctrl.signal });
    } catch (e) {
      threw = true;
      expect((e as Error).name).toBe("AbortError");
    }
    expect(threw).toBe(true);
  });
});

describe("the demo answers", () => {
  test("never touch the network and say so", () => {
    expect(fast().sendsData).toBe(false);
  });

  test("are the same every time, so the demo is predictable", async () => {
    const a = await route("Extract the action items", fast());
    const b = await route("Extract the action items", fast());
    expect(a.text).toBe(b.text);
    expect(a.finalLane).toBe(b.finalLane);
  });

  test("bigger models give longer answers, so the difference is visible", async () => {
    const c = fast();
    const small = await c.generate({ model: "@cf/meta/llama-3.2-3b-instruct", prompt: "Explain routing" });
    const big = await c.generate({ model: "@cf/openai/gpt-oss-120b", prompt: "Explain routing" });
    expect(big.text.length).toBeGreaterThan(small.text.length);
  });
});
