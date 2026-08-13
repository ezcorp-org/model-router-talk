#!/usr/bin/env bun
/**
 * Command line version, for the workshop exercise.
 *
 * Run it with Bun (no install needed) or with Node 22 and up:
 *
 *   bun src/cli.ts --demo
 *   node --experimental-strip-types src/cli.ts --demo
 *
 * Setup for real answers:
 *   export CF_ACCOUNT_ID=...
 *   export CF_API_TOKEN=...
 *
 * Or use --mock for demo answers with no key and no internet.
 */

import {
  formatCost,
  LANES,
  MockClient,
  ModelError,
  route,
  WorkersAIClient,
} from "./router/index.ts";
import type { ModelClient, RouteCard } from "./router/index.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const words = args.filter((a) => !a.startsWith("--"));

const EXAMPLES = [
  "Pull the to-do items out of these meeting notes: Ana updates the pricing page by Friday. Ben is blocked on the sandbox key.",
  "Read this function and suggest five tests: function splitBill(total, people) { return total / people; }",
  "Design a safe password reset process for a consumer app.",
  "Summarise this confidential salary review for the leadership team.",
];

function buildClient(): ModelClient {
  if (flag("mock")) return new MockClient(150);

  const accountId = process.env.CF_ACCOUNT_ID ?? "";
  const apiToken = process.env.CF_API_TOKEN ?? "";
  if (!accountId || !apiToken) {
    console.error(
      [
        "",
        "  Missing CF_ACCOUNT_ID or CF_API_TOKEN.",
        "",
        "    export CF_ACCOUNT_ID=your_account_id",
        "    export CF_API_TOKEN=your_workers_ai_token",
        "",
        "  Your account ID is in the Cloudflare dashboard URL. To make a token, go to",
        "  AI, then Workers AI, then Create a Workers AI API Token.",
        "",
        "  Or run with demo answers and no key at all:",
        "",
        "    bun src/cli.ts --mock --demo",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
  // No CORS outside a browser, so this talks to Cloudflare directly.
  return new WorkersAIClient({ accountId, apiToken });
}

const WIDTH = 70;

function printCard(card: RouteCard): void {
  const rows: Array<[string, string]> = [
    ["Request", card.prompt],
    ["Chose", card.finalLane + (card.held ? "  (nothing was sent)" : "")],
  ];
  if (!card.held) rows.push(["Model", LANES[card.finalLane].model ?? ""]);
  rows.push(["Reason", card.decision.reason]);

  if (card.held) {
    rows.push(["Sent", "nothing. that is the whole point."]);
  } else {
    for (const a of card.attempts) {
      rows.push(["Check", `${a.check.ok ? "PASSED" : "FAILED"} on ${a.lane}. ${a.check.note}`]);
    }
    const secs = card.attempts.reduce((s, a) => s + a.seconds, 0);
    rows.push(["Time", `${secs.toFixed(1)} seconds`]);
    rows.push([
      "Cost",
      `${formatCost(card.cost)}${
        card.attempts.length > 1 ? ` across ${card.attempts.length} tries` : ""
      }`,
    ]);
  }

  console.log("\n  +" + "-".repeat(WIDTH) + "+");
  for (const [label, value] of rows) {
    let text = value.replace(/\s+/g, " ").trim();
    let first = true;
    const room = WIDTH - 14;
    while (text.length > 0) {
      let chunk = text.slice(0, room);
      if (text.length > room && chunk.includes(" ")) {
        chunk = chunk.slice(0, chunk.lastIndexOf(" "));
      }
      const head = first ? `${label}:`.padEnd(11) : " ".repeat(11);
      console.log(`  | ${head} ${chunk.padEnd(room)} |`);
      text = text.slice(chunk.length).trim();
      first = false;
    }
  }
  console.log("  +" + "-".repeat(WIDTH) + "+");

  if (!card.held && card.text) {
    console.log("\n  " + card.text.split("\n").slice(0, 40).join("\n  ") + "\n");
  } else if (card.held) {
    console.log("\n  Held back for a person. No request left this machine.\n");
  }
}

async function handle(prompt: string, client: ModelClient): Promise<void> {
  try {
    const card = await route(prompt, client, {
      onAttempt: (a) => {
        if (!a.check.ok) {
          console.log(`\n  ! ${a.lane} failed the check (${a.check.note}). Trying the next one up.`);
        }
      },
    });
    printCard(card);
  } catch (err) {
    if (err instanceof ModelError) {
      console.error(`\n  ${err.message}\n  ${err.hint}\n`);
      process.exit(1);
    }
    throw err;
  }
}

async function main(): Promise<void> {
  const client = buildClient();

  console.log(`\n  Model router  ->  ${client.label}`);
  console.log("  " + "-".repeat(52));
  for (const lane of ["FAST", "QUALITY", "PREMIUM"] as const) {
    console.log(`  ${lane.padEnd(8)} ${(LANES[lane].model ?? "").padEnd(32)} ${LANES[lane].blurb}`);
  }
  console.log(`  ${"HOLD".padEnd(8)} ${"(nothing is sent)".padEnd(32)} ${LANES.HOLD.blurb}\n`);

  if (flag("demo")) {
    for (const example of EXAMPLES) await handle(example, client);
    return;
  }
  if (words.length > 0) {
    await handle(words.join(" "), client);
    return;
  }

  console.log("  Type a request. Press Enter on an empty line to quit.\n");
  for await (const line of console) {
    const prompt = line.trim();
    if (!prompt) break;
    await handle(prompt, client);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
