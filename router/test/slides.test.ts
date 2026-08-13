import { test, expect, describe } from "bun:test";
import {
  CLASSIFIER_SCHEMA,
  DEFAULT_CONFIG,
  decideLane,
  formatCost,
  LANE_COLOURS,
  LANES,
  MockClient,
  route,
} from "../src/router/index.ts";

/**
 * These tests exist because the slides make specific promises about where each
 * example request goes. If someone edits a rule, or rewords an example, the
 * slides quietly become wrong in front of a room of people.
 *
 * This caught a real bug once already: the demo prompt was reworded from
 * "Review this function" to "Read this function" during a plain language pass,
 * which stopped it matching the QUALITY rule. The slide said QUALITY, the demo
 * did FAST. Keep this file in step with the demo and exercise slides.
 */

const client = () => new MockClient(0);

/** Every pattern in the config that matches this prompt, as written. */
function matching(prompt: string): string[] {
  return [...DEFAULT_CONFIG.policyRules, ...DEFAULT_CONFIG.taskRules]
    .flatMap((rule) => rule.patterns)
    .filter((pattern) => pattern.test(prompt))
    .map((pattern) => pattern.source);
}

describe("the demo examples go where the slides say", () => {
  const cases: Array<[string, string]> = [
    ["Pull the to-do items out of these meeting notes.", "FAST"],
    ["Read this function and suggest five tests for it.", "QUALITY"],
    ["Review this function and suggest five tests for it.", "QUALITY"],
    ["Design a safe password reset process.", "PREMIUM"],
  ];

  for (const [prompt, expected] of cases) {
    test(`"${prompt.slice(0, 40)}..." goes to ${expected}`, async () => {
      const decision = await decideLane(prompt, client());
      expect(decision.lane).toBe(expected);
    });
  }

  test("the first three are decided by rules, so they cost nothing to route", async () => {
    for (const [prompt] of cases) {
      const d = await decideLane(prompt, client());
      expect(d.classifierSeconds).toBe(0);
      expect(["policy", "task"]).toContain(d.mechanism.kind);
    }
  });
});

describe("the escalation slide", () => {
  // The slide shows this exact request starting at FAST, failing its check, and
  // moving up to QUALITY for 6 units. Every one of those numbers is on screen,
  // so every one of them is checked here.
  //
  // This is also the drift this file failed to catch once: the slide used to
  // say "Give me the settings in JSON format", which matches no rule at all, so
  // the card claimed a rule had decided it when really the chooser had.
  const prompt = "Give me the settings as JSON.";

  test("a job type rule decides it, not the chooser", async () => {
    const d = await decideLane(prompt, client());
    expect(d.mechanism.kind).toBe("task");
    expect(d.classifierSeconds).toBe(0);
  });

  test('the rule that matches is the one the slide names, "as JSON"', async () => {
    const d = await decideLane(prompt, client());
    if (d.mechanism.kind !== "task") throw new Error("expected a job type rule");
    expect(d.mechanism.pattern.toLowerCase()).toContain("as json");
  });

  test("it starts at FAST, fails the check, and ends at QUALITY", async () => {
    const card = await route(prompt, client());
    expect(card.decision.lane).toBe("FAST");
    expect(card.attempts.length).toBe(2);
    expect(card.attempts[0]!.lane).toBe("FAST");
    expect(card.attempts[0]!.check.ok).toBe(false);
    expect(card.finalLane).toBe("QUALITY");
    expect(card.attempts[1]!.check.ok).toBe(true);
  });

  test("the total is the $0.06 across 2 tries the slide shows", async () => {
    const card = await route(prompt, client());
    expect(formatCost(card.cost)).toBe("$0.06");
    expect(card.attempts.length).toBe(2);
  });
});

describe("the route card slide", () => {
  // The card on that slide names the rule that matched. It used to say the
  // request contained the word "extract", which it does not.
  const prompt = "Pull the to-do items out of these meeting notes.";

  test("the pattern printed on the slide is the pattern in the file, character for character", async () => {
    // The slide now shows the regex itself rather than a description of it, so
    // a paraphrase is no longer good enough. If someone edits this pattern, the
    // slide is wrong on screen and this test says so.
    const d = await decideLane(prompt, client());
    if (d.mechanism.kind !== "task") throw new Error("expected a job type rule");
    expect(d.mechanism.pattern).toBe("\\bpull\\b[^.?!]*\\bout of\\b");
  });

  test("the parts the slide explains are the parts the pattern uses", () => {
    // The note explains \b and [^.?!]* by name. Both have to still be in there.
    const pattern = "\\bpull\\b[^.?!]*\\bout of\\b";
    expect(pattern).toContain("\\b");
    expect(pattern).toContain("[^.?!]*");
    // And the claim that "pulling" does not match, which is what \b buys you.
    expect(new RegExp(pattern, "i").test("Pulling the to-do items out of these notes")).toBe(
      false,
    );
  });

  test("the reason on the card is the rule's own words", async () => {
    const d = await decideLane(prompt, client());
    expect(d.reason).toBe("Simple job with a predictable answer, and easy to check");
  });

  test("it costs the $0.01 the card shows", async () => {
    const card = await route(prompt, client());
    expect(formatCost(card.cost)).toBe("$0.01");
  });
});

describe("what the chooser is allowed to answer", () => {
  // The order slide now says out loud that the chooser can answer FAST,
  // QUALITY or PREMIUM "and nothing else", and that holding something back
  // stays a rule a person wrote. That is a promise about the schema.
  test("the slide's three options are exactly what the schema offers", () => {
    expect(CLASSIFIER_SCHEMA.properties.lane.enum).toEqual(["FAST", "QUALITY", "PREMIUM"]);
  });

  test("HOLD is not among them, so no model can choose to withhold", () => {
    expect(CLASSIFIER_SCHEMA.properties.lane.enum).not.toContain("HOLD");
  });
});

describe("the final discussion example", () => {
  const prompt =
    "I need a plan to switch our login system over to passkeys without locking out the people who already have accounts.";

  test("goes to PREMIUM, decided by a safety rule", async () => {
    const d = await decideLane(prompt, client());
    expect(d.lane).toBe("PREMIUM");
    expect(d.mechanism.kind).toBe("policy");
  });

  test("exactly one pattern matches, which is the discussion point", () => {
    // The slide used to claim three rules matched, and asked whether that meant
    // confidence or coincidence. Only one ever did. The old test here checked
    // that the prompt contained three words, which is not the same thing at all
    // and is why the slide was wrong for as long as it was.
    expect(matching(prompt)).toEqual(["\\bpasskey"]);
  });

  test("the card names that pattern, and the rule's own reason", async () => {
    const d = await decideLane(prompt, client());
    if (d.mechanism.kind !== "policy") throw new Error("expected a safety rule");
    expect(d.mechanism.pattern).toBe("\\bpasskey");
    expect(d.reason).toBe("Security, logins or payments, where mistakes are costly");
  });

  test("the reworded version the slide asks about really does fall through", async () => {
    // The slide asks the room what happens to the same request without the one
    // word that matched. If a rule caught it after all, the question is dead.
    const reworded =
      "I need a plan to move everyone to phishing-resistant sign-in without locking out the people who already have accounts.";
    expect(matching(reworded)).toEqual([]);
    const d = await decideLane(reworded, client());
    expect(d.mechanism.kind).toBe("classifier");
  });
});

describe("the order slide lists every step the code takes", () => {
  test("the length check is a real step, at the number the slide shows", async () => {
    expect(DEFAULT_CONFIG.longRequestChars).toBe(1000);
    // No rule matches this, so only the length step can catch it. The slide
    // omitted this step entirely until someone read the code next to it.
    const long = "banana ".repeat(200);
    expect(matching(long)).toEqual([]);
    const d = await decideLane(long, client());
    expect(d.mechanism).toEqual({ kind: "length", over: 1000 });
    expect(d.lane).toBe("QUALITY");
    expect(d.classifierSeconds).toBe(0);
  });

  test("just under the limit falls through to the chooser instead", async () => {
    const d = await decideLane("z".repeat(1000), client());
    expect(d.mechanism.kind).toBe("classifier");
  });
});

describe("the exercise slide asks for rules that do not exist yet", () => {
  // Four of the five ideas on this slide were already in the file. Someone
  // would have added a rule, seen nothing change, and concluded they had got
  // it wrong. These assertions are the slide, in code.

  const notYet = [
    "Draft an invoice for a refund",
    "We had a chargeback last week",
    "Rewrite our privacy notice",
    "Store the home address field",
    "ELI5 how DNS works",
    "Benchmark this loop",
    "Our latency is up",
  ];

  for (const prompt of notYet) {
    test(`"${prompt}" is not covered, so adding a rule for it changes something`, () => {
      expect(matching(prompt)).toEqual([]);
    });
  }

  const alreadyThere = ["Move this to production", "Anonymise the medical notes"];

  for (const prompt of alreadyThere) {
    test(`"${prompt}" is already covered, as the slide now warns`, () => {
      expect(matching(prompt).length).toBeGreaterThan(0);
    });
  }

  test("the presenter guide's Django prompt only works once a rule is added", () => {
    // The guide used to say "Why is my Django page loading so slowly?", which
    // already matched the QUALITY list through "why is". Someone would add a
    // rule, see QUALITY, and have no idea whether it was theirs.
    expect(matching("Our Django page is loading slowly")).toEqual([]);
    expect(matching("Why is my Django page loading so slowly?").length).toBeGreaterThan(0);
  });

  test("the migration surprise the guide builds on is real", () => {
    // A safety rule catches this before any new job type rule can, which is
    // the point of the whole exercise.
    expect(matching("Why is my Django migration failing?")).toContain("\\bmigrat(e|ion)\\b");
  });
});

describe("the lanes match what the slides show", () => {
  test("model names are exactly the ones the workshop documents", () => {
    expect(LANES.FAST.model).toBe("@cf/meta/llama-3.2-3b-instruct");
    expect(LANES.QUALITY.model).toBe("@cf/qwen/qwen3-30b-a3b-fp8");
    expect(LANES.PREMIUM.model).toBe("@cf/openai/gpt-oss-120b");
    expect(LANES.HOLD.model).toBeNull();
  });

  test("costs match the 1c, 5c and 20c a request the slides show", () => {
    expect(LANES.FAST.cost).toBe(1);
    expect(LANES.QUALITY.cost).toBe(5);
    expect(LANES.PREMIUM.cost).toBe(20);
    expect(LANES.HOLD.cost).toBe(0);
    expect([formatCost(1), formatCost(5), formatCost(20)]).toEqual(["$0.01", "$0.05", "$0.20"]);

    // The chart claims 700x1c + 250x5c + 50x20c = $29.50 against 1000x20c = $200.
    const routed = 700 * LANES.FAST.cost + 250 * LANES.QUALITY.cost + 50 * LANES.PREMIUM.cost;
    const everythingBig = 1000 * LANES.PREMIUM.cost;
    expect(formatCost(routed)).toBe("$29.50");
    expect(formatCost(everythingBig)).toBe("$200");
    expect(Math.round((1 - routed / everythingBig) * 100)).toBe(85);
  });

  test('the "ask every model" slide adds up, including the part that stings', () => {
    // The slide claims $0.26 to ask all three, an average of 3 cents to route
    // the same request, and that 26 cents is worse than always paying for
    // PREMIUM. All three come from the lane costs, so all three move if those do.
    const askEveryone = LANES.FAST.cost + LANES.QUALITY.cost + LANES.PREMIUM.cost;
    expect(formatCost(askEveryone)).toBe("$0.26");
    expect(askEveryone).toBeGreaterThan(LANES.PREMIUM.cost);

    // The 70/25/5 mix the cost chart two slides later uses.
    const routed = 70 * LANES.FAST.cost + 25 * LANES.QUALITY.cost + 5 * LANES.PREMIUM.cost;
    expect(Math.round(routed / 100)).toBe(3);
  });

  test("the cost chart's three bars, and the widths they are drawn at", () => {
    // Everything on the chart is per 1,000 requests, in the deck's 70/25/5 mix.
    const fast = 700 * LANES.FAST.cost;
    const quality = 250 * LANES.QUALITY.cost;
    const premium = 50 * LANES.PREMIUM.cost;
    const routed = fast + quality + premium;
    const everythingBig = 1000 * LANES.PREMIUM.cost;
    const askEveryone =
      1000 * (LANES.FAST.cost + LANES.QUALITY.cost + LANES.PREMIUM.cost);

    // The row label spells the sum out: $7 + $12.50 + $10 = $29.50.
    expect([fast, quality, premium].map(formatCost)).toEqual(["$7", "$12.50", "$10"]);
    expect([routed, everythingBig, askEveryone].map(formatCost)).toEqual([
      "$29.50",
      "$200",
      "$260",
    ]);

    // Bars are drawn as a percentage of the widest one, and those percentages
    // are typed into the slide by hand. If a cost moves, they lie.
    const pct = (n: number) => Math.round((n / askEveryone) * 10000) / 100;
    expect([pct(fast), pct(quality), pct(premium)]).toEqual([2.69, 4.81, 3.85]);
    expect(pct(everythingBig)).toBe(76.92);
    expect(pct(askEveryone)).toBe(100);
    // And the axis midpoint the slide prints.
    expect(formatCost(askEveryone / 2)).toBe("$130");
  });

  test("colours match the deck, including orange being left out", () => {
    expect(LANE_COLOURS.FAST).toBe("#3B9EF5");
    expect(LANE_COLOURS.QUALITY).toBe("#2DBD72");
    expect(LANE_COLOURS.PREMIUM).toBe("#EEC216");
    // Orange is deliberately not a lane colour. Next to yellow it is too hard
    // to tell apart, which matters on a projector.
    expect(Object.values(LANE_COLOURS)).not.toContain("#F29C1C");
  });
});
