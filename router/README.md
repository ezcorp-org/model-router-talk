# @ezcorp/model-router

A small model router in TypeScript. The core is plain logic with no
dependencies, so the same code runs in a browser, in a Cloudflare Worker, in
Node and in Bun.

This is the code behind the "Right Model, Right Task" workshop, packaged so the
examples can run on a webpage with nothing to install.

## What is in here

```
src/router/          the core. no dependencies, no network access
  types.ts           shared types
  config.ts          the models, the rules, the classifier prompt
  decide.ts          works out which model should handle a request
  check.ts           decides whether an answer is good enough
  route.ts           the whole pipeline, including trying a stronger model
  clients/
    types.ts         the one interface the core needs from the outside world
    mock.ts          demo answers. no network, no key
    workersai.ts     real answers from Cloudflare Workers AI
  rules.ts           compiles rules typed by a person, refuses the dangerous ones
src/cli.ts           command line version, for the workshop exercise
worker/proxy.ts      the small Worker that makes browser requests possible
test/                126 tests, run with `bun test`
```

This package knows nothing about any UI framework. The website lives in `site/`
and imports from here; nothing here imports from there.

## Quick start

```ts
import { route, MockClient, formatCost } from "@ezcorp/model-router";

const card = await route("Summarise these meeting notes", new MockClient());

console.log(card.finalLane); // "FAST"
console.log(card.cost); // 1, in whole cents
console.log(formatCost(card.cost)); // "$0.01"
console.log(card.text); // the answer
```

Costs are whole cents, not dollars, because money in floating point does not add
up and a card that totals three attempts would eventually print something absurd.
`formatCost` is the one place that turns them into money.

`route()` returns a route card describing everything that happened: which model
was chosen, why, what the check said, whether it had to try a stronger model,
and what it cost. That object is what the UI renders and what you would save if
you wanted to learn from it later.

## Changing the models and rules at runtime

Everything the decision depends on lives in one value, so a UI can hand the
router a config a person just edited:

```ts
import { route, DEFAULT_CONFIG, MockClient } from "@ezcorp/model-router";

const config = {
  ...DEFAULT_CONFIG,
  taskRules: [
    { lane: "PREMIUM", reason: "We care about badgers", patterns: [/\bbadger\b/i] },
    ...DEFAULT_CONFIG.taskRules,
  ],
};

const card = await route("Tell me about a badger", new MockClient(), { config });
```

Leave `config` out and you get the behaviour the slides describe, unchanged.

Rules that came from a text box need compiling first, which validates them:

```ts
import { compileRule, RuleError } from "@ezcorp/model-router";

try {
  const rule = compileRule({ lane: "FAST", reason: "Easy", patterns: ["\\bTL;?DR\\b"] });
} catch (err) {
  if (err instanceof RuleError) console.log(err.message, err.pattern);
}
```

`compileRule` refuses invalid regex, empty patterns, patterns over 200
characters, and anything carrying the `/g` flag. Global patterns are the
dangerous one: a global regex remembers where it stopped last time, so a shared
one matches every *other* request and the routing quietly starts flickering.

## Deciding without calling anything

`previewDecision(prompt, config)` returns the lane a request would get, using
only the rules. No network, no key, no cost. The website runs it on every
keystroke. When no rule matches it says so rather than guessing, because that is
the point where the real router would have to pay the chooser to decide.

## The important bit about keys in a browser

**Cloudflare's API does not allow requests from a webpage.** `api.cloudflare.com`
sends no CORS headers, so the browser blocks the request before it is even sent.
This is not something you can configure around from the page side. Cloudflare's
own guidance is to put a small server in between.

That is what `worker/proxy.ts` is. It is about 60 lines and it:

- holds **no key of its own**, so there is nothing to steal and nothing to bill
  you for if someone finds the URL
- passes the visitor's own token straight through without storing or logging it
- only accepts requests from the sites you list
- only allows the four models this workshop uses
- caps the request size

Deploy it once:

```bash
npx wrangler deploy worker/proxy.ts --name router-proxy --compatibility-date 2026-01-01
```

Then edit `ALLOWED_ORIGINS` at the top of that file to match your site.

If you would rather not run anything at all, do not deploy it. Without a proxy
URL the website stays on demo answers and says so, and those still show the
rules, the checks and trying a stronger model, which is all of the interesting
behaviour.

## Using it outside a browser

There is no CORS outside a browser, so you can talk to Cloudflare directly:

```ts
import { route, WorkersAIClient } from "@ezcorp/model-router";

const client = new WorkersAIClient({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: process.env.CF_API_TOKEN!,
});

const card = await route("Design a safe password reset flow", client);
```

## The command line version

For the workshop exercise:

```bash
bun src/cli.ts --mock --demo          # demo answers, no key, no internet
bun src/cli.ts --demo                 # real answers, needs the two variables
bun src/cli.ts "your request here"
```

Or with Node 22 and up, using its built in TypeScript support:

```bash
node --experimental-strip-types src/cli.ts --mock --demo
```

## Writing your own rules

Rules live in `src/router/config.ts`. Each one says: if any of these patterns
match, send it to this model for this reason.

```ts
export const TASK_RULES: Rule[] = [
  {
    lane: "QUALITY",
    reason: "Mentions a framework, so it needs real knowledge",
    patterns: [/\bDjango\b/i, /\bRails\b/i],
  },
];
```

Two things to know:

**Order matters.** Safety rules run before job type rules, and both run before
the chooser. A request mentioning `migration` hits a safety rule and goes to
PREMIUM even if you wrote a rule that should have caught it first. This surprises
everyone at least once, and it is the main reason teams eventually move past
hand written rules.

**Never use the `/g` flag** on a pattern. A global regular expression remembers
where it stopped last time, so it would match every other request. There is a
test that checks for this.

## Adding a different model provider

Implement one method:

```ts
class MyClient implements ModelClient {
  readonly label = "My provider";
  readonly sendsData = true;

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const started = Date.now();
    const text = await callYourApi(req.model, req.prompt);
    return { text, seconds: (Date.now() - started) / 1000 };
  }
}
```

Nothing else changes. The rules, the checks and the escalation all work the same.

## Tests

```bash
bun test        # 126 tests
tsc --noEmit    # type check
```

`test/slides.test.ts` is worth knowing about. It checks that the example
requests in the slides actually go to the models the slides claim. This has
already caught three real bugs. A plain language edit reworded two demo prompts
so they no longer matched any rule, and the demo silently started routing them
somewhere else. A route card on a slide named a rule that did not exist, and
another named a rule that never matched the request beside it. If you edit a
rule, reword an example, or change what a card claims, run this.

## A note on the two shim files

`src/node-shims.d.ts` and `test/bun-test.d.ts` exist only so `tsc` passes
without `@types/node` and `@types/bun` installed. Once this is inside your real
project with those packages available, delete both.
