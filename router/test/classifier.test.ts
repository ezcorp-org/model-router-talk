import { describe, expect, test } from "bun:test";
import {
  CLASSIFIER_SCHEMA,
  DEFAULT_CONFIG,
  decideLane,
  MockClient,
  parseClassifierReply,
  type GenerateRequest,
  type GenerateResult,
  type ModelClient,
} from "../src/router/index.ts";

/** A client that answers with whatever you give it, and records the request. */
class Scripted implements ModelClient {
  readonly label = "scripted";
  readonly sendsData = false;
  seen: GenerateRequest[] = [];

  constructor(private readonly reply: string) {}

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    this.seen.push(req);
    return { text: this.reply, seconds: 0 };
  }
}

/** A prompt no rule matches, so the chooser is the only thing that can decide. */
const UNMATCHED = "Tell me about badgers";

describe("the chooser is held to a schema", () => {
  test("the schema only offers the three model lanes", () => {
    expect(CLASSIFIER_SCHEMA.properties.lane.enum).toEqual(["FAST", "QUALITY", "PREMIUM"]);
  });

  test("HOLD is not offered, so no model can choose to keep something private", () => {
    expect(CLASSIFIER_SCHEMA.properties.lane.enum).not.toContain("HOLD");
  });

  test("the schema is actually sent with the request", async () => {
    const client = new Scripted('{"lane":"FAST"}');
    await decideLane(UNMATCHED, client);
    expect(client.seen[0]!.jsonSchema).toEqual(CLASSIFIER_SCHEMA);
  });

  test("enough room is asked for that the JSON is not cut in half", async () => {
    const client = new Scripted('{"lane":"FAST"}');
    await decideLane(UNMATCHED, client);
    expect(client.seen[0]!.maxTokens).toBeGreaterThan('{"lane": "PREMIUM"}'.length);
  });
});

describe("reading a reply that followed the schema", () => {
  test("plain JSON", () => {
    expect(parseClassifierReply('{"lane": "FAST"}')).toBe("FAST");
    expect(parseClassifierReply('{"lane": "QUALITY"}')).toBe("QUALITY");
    expect(parseClassifierReply('{"lane": "PREMIUM"}')).toBe("PREMIUM");
  });

  test("case does not matter", () => {
    expect(parseClassifierReply('{"lane":"premium"}')).toBe("PREMIUM");
  });

  test("JSON wrapped in a sentence still parses", () => {
    expect(parseClassifierReply('Here you go: {"lane": "QUALITY"}')).toBe("QUALITY");
  });

  test("a lane outside the schema is refused rather than trusted", () => {
    expect(parseClassifierReply('{"lane": "BANANA"}')).toBeNull();
  });

  test("HOLD is refused even when the model asks for it", () => {
    // Whether something is too sensitive to send is a rule a person wrote.
    // A model must never be able to reach that decision by asking.
    expect(parseClassifierReply('{"lane": "HOLD"}')).toBeNull();
  });

  test("JSON cut off mid object does not throw", () => {
    expect(parseClassifierReply('{"lane":')).toBeNull();
  });
});

describe("reading a reply that ignored the schema", () => {
  // JSON Mode is not on every model, and Cloudflare's docs say it can fail on
  // harder requests, so prose has to stay survivable.

  test("a bare lane name", () => {
    expect(parseClassifierReply("FAST")).toBe("FAST");
  });

  test("a chatty reply", () => {
    expect(parseClassifierReply("Sure! I'd say QUALITY.")).toBe("QUALITY");
  });

  test("a denied lane is not the answer", () => {
    // This is the one that used to be wrong, and wrong the expensive way:
    // it scanned as PREMIUM, which is twenty times the cost of the right lane.
    expect(parseClassifierReply("This is not PREMIUM, it's simple, so FAST")).toBe("FAST");
    expect(parseClassifierReply("Definitely not a PREMIUM task. FAST.")).toBe("FAST");
    expect(parseClassifierReply("Rather than PREMIUM, use FAST")).toBe("FAST");
  });

  test("a word that merely starts with a lane name is not a lane", () => {
    expect(parseClassifierReply("That would be the FASTEST option")).toBeNull();
  });

  test("two lanes, neither denied, takes the more careful one", () => {
    expect(parseClassifierReply("I think FAST, though it could be QUALITY")).toBe("QUALITY");
  });

  test("nothing usable", () => {
    expect(parseClassifierReply("banana")).toBeNull();
  });
});

describe("when the chooser is no help at all", () => {
  test("an unusable answer falls back to the middle lane and says so", async () => {
    const d = await decideLane(UNMATCHED, new Scripted("banana"));
    expect(d.lane).toBe("QUALITY");
    expect(d.reason).toContain("unusable");
  });

  test("a lane it was not allowed to pick is treated as unusable", async () => {
    const d = await decideLane(UNMATCHED, new Scripted('{"lane":"HOLD"}'));
    expect(d.lane).toBe("QUALITY");
  });
});

describe("the reply is kept, so the card can show it", () => {
  // The chooser is the one step on a route card that a reader has to take on
  // trust. Keeping the raw answer is what lets the page show it instead.

  test("the chooser's answer is carried on the decision, word for word", async () => {
    const d = await decideLane(UNMATCHED, new Scripted('{"lane":"FAST"}'));
    expect(d.mechanism).toEqual({
      kind: "classifier",
      model: DEFAULT_CONFIG.classifierModel,
      reply: '{"lane":"FAST"}',
    });
  });

  test("an unusable answer is kept too, because that is the interesting case", async () => {
    const d = await decideLane(UNMATCHED, new Scripted("probably fine either way"));
    if (d.mechanism.kind !== "classifier") throw new Error("expected the chooser");
    expect(d.mechanism.reply).toBe("probably fine either way");
  });

  test("a rule decision has no reply to show", async () => {
    const d = await decideLane("Summarise this confidential salary review", new MockClient(0));
    expect(d.mechanism.kind).toBe("policy");
    expect("reply" in d.mechanism).toBe(false);
  });

  test("the demo answers give the card real JSON to show", async () => {
    const d = await decideLane(UNMATCHED, new MockClient(0));
    if (d.mechanism.kind !== "classifier") throw new Error("expected the chooser");
    expect(JSON.parse(d.mechanism.reply!).lane).toBe(d.lane);
  });
});

describe("the demo client answers in the same shape as a real one", () => {
  test("its reply parses through the ordinary JSON path", async () => {
    const mock = new MockClient(0);
    const { text } = await mock.generate({
      model: DEFAULT_CONFIG.classifierModel,
      prompt: UNMATCHED,
      system: DEFAULT_CONFIG.classifierSystem,
      jsonSchema: DEFAULT_CONFIG.classifierSchema,
    });
    expect(JSON.parse(text).lane).toBeTruthy();
    expect(parseClassifierReply(text)).not.toBeNull();
  });
});
