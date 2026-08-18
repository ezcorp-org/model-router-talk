# Model Router Talk

A 30 minute talk and hands on workshop about **model routing**: sending each request
to the AI model that suits it, instead of sending everything to the biggest one.

Built for EZCorp. The code runs on Cloudflare Workers AI, so nobody in the room has
to install anything.

There is also a website at **talks.ezcorp.org**, where anyone can read the talk and
use the router without installing or signing up for anything.

```
slides/     the deck, plus the guide for whoever is presenting
router/     the TypeScript router: core library and tests, no UI framework
site/       the website: the deck, and a playground that routes what you type
docs/       the built site. committed, because GitHub Pages serves it directly
```

---

## 1. The idea

Small AI models are quick and cheap. Large ones cost more and take longer, but they
handle hard problems better. Most of the work people send to an AI is easy.

That leaves you with two bad options and one good one:

| Approach | What happens |
|---|---|
| Send everything to the big model | You pay far more than you need to, and everyone waits |
| Send everything to the small model | People start getting wrong answers, and nobody notices for a while |
| **Route each request** | Each one goes where it fits, and something checks the answer |

A **model router** is the part that picks which model handles each request. A good one
also checks whether the answer was any good, and tries a stronger model when it was
not.

The number to judge it by is not the lowest cost per request. It is the lowest cost
per answer that is actually right. A router that halves your bill while getting 8%
more answers wrong has not saved you anything. It has moved the cost somewhere you
are not counting.

---

## 2. What the workshop teaches

The session is 30 minutes and hands on. Attendees end up with one routing rule they
wrote themselves, and an understanding of:

- what model routing is, and the three different things people mean by the word
- why you cannot just ask every model and pick the best answer
- the four ways to build a router, from written rules up to trained ranking
- what checking an answer actually means, and why most checks are free
- how bad answers feed back in and improve the rules over time

The session ends on the wider point: what they really learned is how to build
something that **decides where work should go**. Today the choices were AI models, but
the same shape applies to routing support tickets, tool calls, alerts, or questions
across different knowledge sources.

---

## 3. What is in this repo

### `slides/`

`slides.html` is the whole deck in one file. Open it in any browser.

| Key | What it does |
|---|---|
| arrow keys, or click | move forward and back |
| `F` | fullscreen |
| `Home` | first slide |
| `Shift+Home` | first slide, and forget the saved position |
| `#12` in the address | jump to slide 12 |

25 slides. The first 19 are the timed session, ending on the slide that generalises
the idea. The rest are reference for people to
read afterwards, and the agenda slide says so out loud.

Two behaviours worth knowing:

**It remembers where you were.** Refresh or reopen and it puts you back on the same
slide. This uses the address bar and a saved value, both guarded so that viewers which
block them cannot break the deck.

**One slide holds its answer back.** On the discussion slide near the end, the answer
stays hidden until you press the arrow again, so the room cannot read ahead while they
are still deciding. Any element marked `data-reveal` behaves this way. Printing shows
everything, since paper has no arrow key.

`slides/README.md` is the presenter guide: setup, the exercise, the cost math, and
notes for organizers. Read it before you present.

### `router/`

The code behind the workshop, in TypeScript.

```
src/router/       the core. no dependencies, no network access
  types.ts        shared types
  config.ts       the models, the rules, the classifier prompt
  decide.ts       works out which model should handle a request
  check.ts        decides whether an answer is good enough
  route.ts        the whole pipeline, including trying a stronger model
  clients/        the one interface the core needs from the outside world
    mock.ts       demo answers. no network, no key
    workersai.ts  real answers from Cloudflare Workers AI
  rules.ts        compiles rules a visitor typed, and refuses the dangerous ones
src/cli.ts        command line version, for the workshop exercise
worker/proxy.ts   the small Worker that makes browser requests possible
test/             128 tests
```

The core is plain TypeScript with no dependencies and no knowledge of any UI
framework, so the same code runs in a browser, in a Cloudflare Worker, in Node and in
Bun. Anything that touches the network goes through a single `ModelClient` interface
with one method.

Everything the routing decision depends on lives in a `RouterConfig`: the lanes, both
sets of rules, the length threshold and the classifier. `route()` and `decideLane()`
take one and fall back to `DEFAULT_CONFIG`, which is assembled from the constants the
slides describe. That is what lets the website hand the router a config a visitor
edited in a text box, and it is the difference between the deck *claiming* the model
list is a setting and it actually being one.

---

## 4. How the router decides

```
A request arrives
   │
   ▼
1. Safety rules           security, privacy, legal, payments, production
   │                      └──▶ send to PREMIUM, or hold it back entirely
   ▼
2. Simple job rules       clearly easy work, or clearly hard work
   │                      └──▶ pick FAST or QUALITY, at no cost
   ▼
3. Length check           over 1000 characters goes to QUALITY
   │
   ▼
4. The chooser            only for requests the rules did not cover
   │                      └──▶ picks FAST, QUALITY or PREMIUM, as JSON
   ▼
5. Send it to the model
   │
   ▼
6. Check the answer
   ├──▶ looks good ──▶ return it
   └──▶ looks wrong ──▶ try the next model up
```

The order is deliberate. Rules run before the chooser because rules are free, they
behave the same way every time, and a teammate can read them in a code review. You
also do not want any model deciding how careful to be about someone's password, or
deciding whether private text is safe to send at all.

Every request produces a **route card**: which model was chosen, why, what the check
said, whether it had to try again, and what it cost. That object is what the UI renders
and what you would save if you wanted to learn from it later.

### The models

| Name | Cloudflare model | What it is for | Cost a request |
|---|---|---|---|
| `FAST` | `@cf/meta/llama-3.2-3b-instruct` | Pulling out info, reformatting, summaries | $0.01 |
| `QUALITY` | `@cf/qwen/qwen3-30b-a3b-fp8` | Reading code, writing tests, multi step thinking | $0.05 |
| `PREMIUM` | `@cf/openai/gpt-oss-120b` | Design work, security, big changes | $0.20 |
| `HOLD` | nothing is sent | Legal, private, medical, confidential | $0 |
| the chooser | `@cf/meta/llama-3.1-8b-instruct` | Picks which one to use. Answers `{"lane": "FAST"}` | small |

Those prices are made up. What is real is the gap between them, which is roughly what
you see across AI companies. They are held in code as whole cents, because money in
floating point does not add up: `cost: 20` is the $0.20 on the card.

All four model IDs were checked against Cloudflare's published list. They are settings
rather than code, so swap them freely. The list changes often, so check it again before
your event.

**Why the chooser is not the smallest model.** It is asked for JSON against a schema
whose `lane` is an enum, so the answer parses by construction rather than being
searched for something that looks like a lane name. Nothing on Workers AI below 8B
supports JSON Mode, so the chooser cannot be a 1B model and still be read reliably.
The alternative is scanning prose, which fails in the expensive direction: a reply of
"this is not PREMIUM, so FAST" scans as PREMIUM, twenty times the cost of the right
answer. There is a test for exactly that sentence.

**`HOLD` is deliberately absent from that enum.** The chooser cannot pick it. Whether
something is too sensitive to send is a decision a person wrote down in a rule and can
defend in a code review, and it should never be reachable by a model changing its mind.

**Why `HOLD` exists.** An earlier version of this workshop ran models on the attendee's
own laptop, where keeping something private just meant the text never left the machine.
On Workers AI every model runs on somebody else's computer. So privacy stops being
something the setup gives you for free and becomes one more thing the program has to
decide. It is a real option with real rules, and its entire job is to not send
anything.

---

## 5. Two things that will bite you

### Cloudflare's API refuses requests from a webpage

`api.cloudflare.com` sends no CORS headers, so a browser cannot call it directly even
with a valid key. The browser blocks the request before it is sent. This is not
something you can configure from the page side. Cloudflare's own guidance is to put a
small server in between.

`router/worker/proxy.ts` is that server, in about 60 lines. It:

- holds **no key of its own**, so there is nothing to steal and nothing to bill you for
  if somebody finds the URL
- passes the visitor's own token straight through without storing or logging it
- only accepts requests from origins you list
- only allows the four models this workshop uses
- caps the request size

Deploy it once with `wrangler`, then edit `ALLOWED_ORIGINS` at the top of the file.

If you would rather not run anything, the demo works fine on mock answers alone. The
checks and the escalation are real. The lane is picked by a stand-in rather than by a
model, and the answer text is invented.

### The free tier is tight for a room

Workers AI gives 10,000 neurons per day for the whole account, resetting at midnight
UTC. Thirty people running the demo lands right at that limit with nothing to spare,
and when it runs out everybody in the room is stuck at once.

`slides/README.md` has the full arithmetic and three ways to handle it. The simple
answer is to put the account on the paid plan, which costs a few dollars for a
workshop.

One related detail somebody will notice: on Cloudflare, `FAST` and `QUALITY` currently
cost the same per token. The $0.01, $0.05 and $0.20 are labelled in the deck as made
up, and the real gap only appears at `PREMIUM`. The speed and quality
differences between the models are real. The cost difference depends on the provider.

---

## 6. Running it

### The demo, with no setup at all

```bash
cd router
bun src/cli.ts --mock --demo
```

No key, no network, no cost. Or with Node 22 and up:

```bash
node --experimental-strip-types src/cli.ts --mock --demo
```

### With real models

```bash
export CF_ACCOUNT_ID="..."     # from your Cloudflare dashboard URL
export CF_API_TOKEN="..."      # needs Workers AI Read and Workers AI Edit

bun src/cli.ts --demo
bun src/cli.ts "your request here"
```

There is no CORS outside a browser, so the command line talks to Cloudflare directly
and needs no proxy.

### The website

```bash
cd site
bun install
bun run dev       # http://localhost:5173
bun run build     # writes docs/, which is what GitHub Pages serves
```

Visitors get working demo answers immediately, with no key and no network. The
playground asks the chooser and nothing else: there are no rules on that page, so the
one decision it makes is the one a model makes. Swap the model behind any lane, or
reword what the chooser is told, and send the same request again. If they want real
answers they can add their own Cloudflare key, which stays in their tab and is never
sent to us. See section 5 for why that also needs a proxy.

The rules are still the workshop's subject. They live in `router/`, they are still
tested, and section 7 is how you write one. They were taken off the website so the page
teaches one idea rather than four.

### Development

```bash
cd router
bun test          # 128 tests
tsc --noEmit      # type check
```

`test/slides.test.ts` is worth knowing about. It checks that the example requests in
the slides actually go to the models the slides claim. This has already caught two real
bugs, where a plain language edit reworded demo prompts so they no longer matched any
rule, and the demo quietly started routing them somewhere else.

---

## 7. Writing your own rules

Rules live in `router/src/router/config.ts`. Each one says: if any of these patterns
match, send it to this model, for this reason.

```ts
export const TASK_RULES: Rule[] = [
  {
    lane: "QUALITY",
    reason: "Mentions a framework, so it needs real knowledge",
    patterns: [/\bDjango\b/i, /\bRails\b/i],
  },
];
```

Two things to know.

**Order matters.** Safety rules run before job type rules, and both run before the
the chooser. A request mentioning `migration` hits a safety rule and goes to `PREMIUM`
even if you wrote a rule that should have caught it first. This surprises everybody at
least once, and it is the main reason teams eventually move past hand written rules.
The workshop exercise is built around letting people discover exactly this.

**Never use the `/g` flag** on a pattern. A global regular expression remembers where
it stopped last time, so it would match every other request. There is a test that
checks for this.

---

## 8. Adding another provider

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

---

## 9. Notes on the design

**The fonts load from Google.** If the venue has no internet the deck falls back to a
standard font and still works, it just looks different. Open it once on the presenting
laptop while connected so the fonts cache, or download the two files and load them with
`@font-face`.

**Orange is deliberately not a lane colour.** The obvious mapping would be yellow,
orange and red for the three models, but orange and yellow are too close to tell apart
reliably, and worse for people with colour blindness. On a projector they look the same.
The lanes use blue, green and yellow instead, which were checked with a colour
separation tool rather than judged by eye. Red is reserved for failures.

**The mock client fails on purpose.** When asked for JSON, the FAST model returns
broken JSON. That is what lets the demo show a check failing and the router moving up a
model, which is the whole lesson. It is deterministic, so the demo behaves the same way
every time you run it.

---

## 10. Status

Working and verified:

- 25 slides, no layout overflow at 1600x900 or 1280x800
- 128 tests passing, `tsc --noEmit` and `svelte-check` clean under strict mode
- all model IDs and pricing checked against Cloudflare's documentation
- the website runs, routes and escalates, checked in a browser at desktop and phone
  widths against the built `docs/` rather than the dev server
- the CORS behaviour in section 5 was measured against the live API, not assumed:
  `api.cloudflare.com` returns 405 on `OPTIONS` with no CORS headers, and
  `gateway.ai.cloudflare.com` returns 401 with none either

Two honest caveats:

**No real call has ever been made to Cloudflare from here**, because there were no
credentials available. The endpoint shape, auth headers, model IDs and error handling
were verified against the documentation, and every routing path is exercised in mock
mode. **Run `bun src/cli.ts --demo` once with a real key before the event.**

**The proxy has never been deployed and exercised end to end from the website.** The
demo path is fully tested; the real path is not. Deploy the proxy and send one request
through it before you rely on it in a room.

---

## 11. Credit

The four approaches to building a router, the point about deciding before you spend,
and the argument for systems that keep learning all come from "How to Build Your Own
Model Router" by Tomás Hernando Kofman of Not Diamond, presented at AI Council.

The tools comparison in the deck was put together from vendor documentation and Not
Diamond's `awesome-ai-model-routing` list. Check it again before committing to
anything, because this area changes quickly.
