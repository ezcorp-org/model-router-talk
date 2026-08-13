import { describe, expect, test } from "bun:test";
import {
  compileConfig,
  compilePattern,
  compileRule,
  DEFAULT_CONFIG,
  decideLane,
  describeMechanism,
  describePattern,
  formatCost,
  MAX_PATTERN_LENGTH,
  MockClient,
  previewDecision,
  route,
  RuleError,
  serializeConfig,
  serializeRule,
  type RouterConfig,
} from "../src/router/index.ts";

const fast = () => new MockClient(0);

/** DEFAULT_CONFIG with one thing changed, leaving the rest alone. */
function withConfig(patch: Partial<RouterConfig>): RouterConfig {
  return { ...DEFAULT_CONFIG, ...patch };
}

describe("the config actually reaches the decision", () => {
  test("a custom rule changes where a request goes", async () => {
    const config = withConfig({
      taskRules: [
        { lane: "PREMIUM", reason: "We care about badgers", patterns: [/\bbadger\b/i] },
      ],
    });

    const withRule = await decideLane("Tell me about a badger", fast(), { config });
    expect(withRule.lane).toBe("PREMIUM");
    expect(withRule.reason).toBe("We care about badgers");

    // Same prompt, default config: no rule matches, so the small model decides.
    const without = await decideLane("Tell me about a badger", fast());
    expect(without.mechanism.kind).toBe("classifier");
  });

  test("omitting the config gives exactly the default behaviour", async () => {
    const a = await decideLane("Extract the action items from these notes", fast());
    const b = await decideLane("Extract the action items from these notes", fast(), {
      config: DEFAULT_CONFIG,
    });
    expect(a.lane).toBe(b.lane);
    expect(a.reason).toBe(b.reason);
    expect(a.mechanism).toEqual(b.mechanism);
  });

  test("the length threshold is configurable", async () => {
    const config = withConfig({ longRequestChars: 10 });
    const d = await decideLane("z".repeat(20), fast(), { config });
    expect(d.lane).toBe("QUALITY");
    expect(d.mechanism).toEqual({ kind: "length", over: 10 });
  });

  test("safety rules still beat job type rules in a custom config", async () => {
    const config = withConfig({
      policyRules: [{ lane: "HOLD", reason: "Never send this", patterns: [/\bsecret\b/i] }],
      taskRules: [{ lane: "FAST", reason: "Looks easy", patterns: [/\bsecret\b/i] }],
    });
    const d = await decideLane("what is the secret", fast(), { config });
    expect(d.lane).toBe("HOLD");
  });

  test("custom lane models and costs are used when routing", async () => {
    const config = withConfig({
      lanes: {
        ...DEFAULT_CONFIG.lanes,
        FAST: { model: "my/tiny-model", blurb: "mine", cost: 3, maxTokens: 100 },
      },
    });
    const card = await route("Extract the action items from these notes", fast(), { config });
    expect(card.finalLane).toBe("FAST");
    expect(card.attempts[0]!.model).toBe("my/tiny-model");
    expect(card.cost).toBe(3);
  });
});

describe("preview, which never calls anything", () => {
  test("reports the rule that matched and which set it came from", () => {
    const p = previewDecision("Summarise this confidential salary review");
    expect(p.kind).toBe("rule");
    if (p.kind !== "rule") throw new Error("expected a rule");
    expect(p.lane).toBe("HOLD");
    expect(p.ruleSet).toBe("policy");
  });

  test("says when only the small model could decide", () => {
    const p = previewDecision("Tell me about badgers");
    expect(p.kind).toBe("classifier");
  });

  test("says nothing at all for an empty prompt", () => {
    expect(previewDecision("").kind).toBe("empty");
    expect(previewDecision("   ").kind).toBe("empty");
  });

  test("agrees with the real router whenever a rule decides it", async () => {
    const prompts = [
      "Summarise this confidential salary review",
      "Design a safe password reset process",
      "Extract the action items from these notes",
      "Read this function and suggest five tests",
      "z".repeat(1200),
    ];
    for (const prompt of prompts) {
      const preview = previewDecision(prompt);
      const real = await decideLane(prompt, fast());
      if (preview.kind === "rule" || preview.kind === "length") {
        expect(preview.lane).toBe(real.lane);
      }
    }
  });
});

describe("compiling patterns a person typed", () => {
  test("a plain pattern compiles, case insensitive, never global", () => {
    const re = compilePattern("\\bmigration\\b");
    expect(re.flags).toBe("i");
    expect(re.global).toBe(false);
    expect(re.test("Plan the MIGRATION")).toBe(true);
  });

  test("the same pattern gives the same answer every time", () => {
    const re = compilePattern("badger");
    expect(re.test("badger")).toBe(true);
    expect(re.test("badger")).toBe(true);
    expect(re.test("badger")).toBe(true);
  });

  test("an empty pattern is refused, because it would match everything", () => {
    expect(() => compilePattern("   ")).toThrow(RuleError);
    expect(() => compilePattern("")).toThrow(/match everything/);
  });

  test("an over long pattern is refused", () => {
    expect(() => compilePattern("a".repeat(MAX_PATTERN_LENGTH + 1))).toThrow(RuleError);
  });

  test("invalid regex is refused with the reason", () => {
    expect(() => compilePattern("(unclosed")).toThrow(RuleError);
    expect(() => compilePattern("[z-a]")).toThrow(RuleError);
  });

  test("a global flag is refused, and the message says why", () => {
    expect(() => compilePattern("/badger/gi")).toThrow(/every other request/);
  });

  test("slashes are refused with the pattern to use instead", () => {
    expect(() => compilePattern("/badger/i")).toThrow(/without the surrounding slashes/);
    expect(() => compilePattern("/badger/i")).toThrow(/badger/);
  });
});

describe("saying a pattern out loud", () => {
  test("word boundaries go, because a reader already assumes them", () => {
    expect(describePattern("\\bconfidential\\b")).toBe("confidential");
    expect(describePattern("\\bmigrat(e|ion)\\b")).toBe("migrat(e|ion)");
  });

  test("a gap in the middle is drawn as a gap", () => {
    expect(describePattern("\\bpull\\b[^.?!]*\\bout of\\b")).toBe("pull … out of");
    expect(describePattern("\\bsuggest\\b[^.?!]*\\btests?\\b")).toBe("suggest … tests?");
  });

  test("an escaped literal is just that literal", () => {
    expect(describePattern("\\bTL;?DR\\b")).toBe("TL;?DR");
    expect(describePattern("\\bdata loss\\b")).toBe("data loss");
  });

  test("it never invents meaning for something it does not recognise", () => {
    // Left alone rather than guessed at. Better to look like a regex than to
    // describe one wrongly on a card someone is trusting.
    const odd = "(?<=x)y{2,3}";
    expect(describePattern(odd)).toBe(odd);
  });

  test("every default pattern comes out non-empty and free of \\b", () => {
    const all = [...DEFAULT_CONFIG.policyRules, ...DEFAULT_CONFIG.taskRules].flatMap(
      (r) => r.patterns,
    );
    expect(all.length).toBeGreaterThan(20);
    for (const p of all) {
      const said = describePattern(p.source);
      expect(said.length).toBeGreaterThan(0);
      expect(said).not.toContain("\\b");
    }
  });
});

describe("writing a cost as money", () => {
  test("under a dollar keeps both decimal places", () => {
    expect(formatCost(1)).toBe("$0.01");
    expect(formatCost(5)).toBe("$0.05");
    expect(formatCost(20)).toBe("$0.20");
    expect(formatCost(6)).toBe("$0.06");
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(99)).toBe("$0.99");
  });

  test("a whole number of dollars drops them", () => {
    expect(formatCost(100)).toBe("$1");
    expect(formatCost(700)).toBe("$7");
    expect(formatCost(1000)).toBe("$10");
    expect(formatCost(20000)).toBe("$200");
  });

  test("anything else keeps the cents", () => {
    expect(formatCost(1250)).toBe("$12.50");
    expect(formatCost(2950)).toBe("$29.50");
    expect(formatCost(101)).toBe("$1.01");
  });

  test("thousands get a separator, so a big number stays readable", () => {
    expect(formatCost(123456)).toBe("$1,234.56");
    expect(formatCost(500000)).toBe("$5,000");
  });

  test("adding up attempts stays exact, which is why costs are cents", () => {
    // The reason a lane's cost is 20 and not 0.2: three PREMIUM attempts in
    // floating point dollars comes to 0.6000000000000001, and a route card
    // would have to round it and hope.
    expect(0.2 * 3).not.toBe(0.6);
    expect(20 * 3).toBe(60);
    expect(formatCost(20 * 3)).toBe("$0.60");
  });
});

describe("one line explaining a decision", () => {
  test("a rule match reads as a sentence, with the pattern in words", async () => {
    const d = await decideLane("Summarise this confidential salary review", fast());
    const line = describeMechanism(d.mechanism, d.reason);
    expect(line).toContain("safety rule");
    expect(line).toContain("confidential");
    expect(line).not.toContain("\\b");
    expect(line.endsWith(".")).toBe(true);
  });

  test("it still works without a reason, for callers that have none", () => {
    const line = describeMechanism({ kind: "length", over: 1000 });
    expect(line).toBe("The request is longer than 1000 characters.");
  });
});

describe("rules that survive being stored", () => {
  test("serialize then compile gives back an equivalent rule", () => {
    const original = DEFAULT_CONFIG.taskRules[0]!;
    const round = compileRule(serializeRule(original));

    expect(round.lane).toBe(original.lane);
    expect(round.reason).toBe(original.reason);
    expect(round.patterns.length).toBe(original.patterns.length);
    for (const [i, pattern] of original.patterns.entries()) {
      expect(round.patterns[i]!.source).toBe(pattern.source);
    }
  });

  test("the whole default config round trips", () => {
    const round = compileConfig(serializeConfig(DEFAULT_CONFIG));
    expect(round.longRequestChars).toBe(DEFAULT_CONFIG.longRequestChars);
    expect(round.classifierModel).toBe(DEFAULT_CONFIG.classifierModel);
    expect(round.policyRules.length).toBe(DEFAULT_CONFIG.policyRules.length);
    expect(round.taskRules.length).toBe(DEFAULT_CONFIG.taskRules.length);
  });

  test("a round tripped config routes the same way", async () => {
    const round = compileConfig(serializeConfig(DEFAULT_CONFIG));
    for (const prompt of [
      "Summarise this confidential salary review",
      "Extract the action items from these notes",
      "Design a safe password reset process",
    ]) {
      const a = await decideLane(prompt, fast());
      const b = await decideLane(prompt, fast(), { config: round });
      expect(b.lane).toBe(a.lane);
      expect(b.reason).toBe(a.reason);
    }
  });

  test("a rule with no patterns is refused", () => {
    expect(() => compileRule({ lane: "FAST", reason: "nothing", patterns: [] })).toThrow(RuleError);
  });

  test("a lane that does not exist is refused, and names the real ones", () => {
    expect(() =>
      compileRule({ lane: "TURBO" as never, reason: "made up", patterns: ["x"] }),
    ).toThrow(/FAST/);
  });

  test("a bad pattern points at the pattern that caused it", () => {
    try {
      compileRule({ lane: "FAST", reason: "broken", patterns: ["fine", "(unclosed"] });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RuleError);
      expect((err as RuleError).pattern).toBe("(unclosed");
    }
  });
});
