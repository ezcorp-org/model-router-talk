import type { CheckResult } from "./types.ts";

/**
 * Decide whether an answer is good enough to show a user.
 *
 * These checks are deliberately simple and fast. A real system would run your
 * tests, validate against a schema, or ask a stronger model to grade it. The
 * point is not that these particular checks are clever. The point is that
 * something checks before the answer reaches a person.
 *
 * A router with no check is just a way of picking models at random.
 */
export function checkAnswer(prompt: string, answer: string): CheckResult {
  const text = answer.trim();

  if (text.length < 40) {
    return { ok: false, note: "the answer is too short to be a real reply" };
  }

  // If the user asked for JSON, the answer has to actually parse as JSON.
  // This is the cheapest real check there is, and it catches a lot.
  if (/\bjson\b/i.test(prompt)) {
    const block = firstJsonBlock(text);
    if (!block) {
      return { ok: false, note: "asked for JSON, but there is no JSON in the answer" };
    }
    try {
      JSON.parse(block);
    } catch (err) {
      return { ok: false, note: `the JSON does not parse: ${(err as Error).message}` };
    }
    return { ok: true, note: "the JSON parsed cleanly" };
  }

  const opening = text.slice(0, 200).toLowerCase();
  const excuses = ["i can't", "i cannot", "i'm unable", "as an ai", "i don't have enough"];
  if (excuses.some((e) => opening.includes(e))) {
    return { ok: false, note: "the model refused or dodged instead of answering" };
  }

  if (text.length > 200 && !/[.!?}\)\]"'`]$/.test(text)) {
    return { ok: false, note: "the answer looks cut off in the middle of a sentence" };
  }

  return { ok: true, note: "passed the basic checks" };
}

/**
 * Pull the first balanced { } or [ ] block out of some text.
 *
 * Models like to wrap JSON in a sentence or a code fence, so we cannot just
 * parse the whole reply. Counting brackets is more reliable than a regular
 * expression, which would stop at the first closing bracket it saw and break
 * on anything nested.
 */
export function firstJsonBlock(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;

  const open = text[start] as "{" | "[";
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
