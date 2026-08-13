import type { GenerateRequest, GenerateResult, ModelClient } from "./types.ts";

/**
 * A stand in for a real model. It never touches the network and needs no key.
 *
 * This exists so the website demo works for everybody the moment the page
 * loads. All the interesting parts of a router (the rules, the checks, the
 * second try when a check fails) are visible without any setup at all.
 *
 * The answers are deterministic, which also makes it useful in tests.
 */
export class MockClient implements ModelClient {
  readonly label = "demo answers";
  readonly sendsData = false;

  /** Simulated thinking time. Set to 0 in tests to keep them fast. */
  constructor(private readonly delayMs: number = 220) {}

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const started = Date.now();
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    return {
      text: fakeAnswer(req),
      seconds: (Date.now() - started) / 1000,
    };
  }
}

/** Size of the model in billions, pulled out of the model name. */
function scaleOf(model: string): number {
  const m = model.match(/(\d+(?:\.\d+)?)b\b/i);
  return m ? parseFloat(m[1]!) : 8;
}

function fakeAnswer(req: GenerateRequest): string {
  const { model, prompt, system, jsonSchema } = req;

  // The chooser is held to a schema, so answer in that shape. Going through
  // the same parsing path as a real reply is the point: if the shape ever
  // changes, the demo breaks in tests rather than quietly in a room.
  if (system?.includes("routing classifier") || jsonSchema?.properties.lane) {
    return JSON.stringify({ lane: classifyLikeASmallModel(prompt) });
  }

  const wantsJson = /\bjson\b/i.test(prompt);
  const scale = scaleOf(model);

  if (wantsJson) {
    // Small models really do get structured output wrong more often. Making
    // the mock do the same is what lets the demo show a check failing and the
    // router moving up a lane, which is the whole lesson.
    if (scale < 5) {
      return "Sure! Here are the settings you asked for:\n{ status: ok, retries: 3, }";
    }
    return '{\n  "status": "ok",\n  "retries": 3,\n  "timeoutSeconds": 30\n}';
  }

  const depth =
    scale < 5
      ? "This is a short demo answer from the fast model. It covers the obvious points and stops."
      : scale < 40
        ? "This is a demo answer from the mid sized model. It works through the request in a few steps and explains the reasoning along the way."
        : "This is a demo answer from the largest model. It considers the trade offs, names the risks, and lays out a plan in order.";

  const topic = prompt.trim().split(/\s+/).slice(0, 8).join(" ");
  return [
    `${depth}`,
    "",
    `You asked about: ${topic}...`,
    "",
    "1. Start with the part that is easiest to check.",
    "2. Decide what a good answer would look like before you begin.",
    "3. Keep a record of what you tried, so you can improve it later.",
    "",
    "(These are demo answers. Everything else on this page is real.)",
  ].join("\n");
}

/**
 * A rough stand in for what the chooser would answer. Deliberately simple, and
 * deliberately not perfect, because the real one is not perfect either.
 */
function classifyLikeASmallModel(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/\bdesign\b|\barchitect|\bsecur|\bmigrat|\bstrategy\b/.test(p)) return "PREMIUM";
  if (/\bcode\b|\btests?\b|\bdebug\b|\bwhy\b|\bexplain\b|\breview\b/.test(p)) return "QUALITY";
  if (prompt.length > 400) return "QUALITY";
  return "FAST";
}
