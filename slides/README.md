# Save millions on inference by building a model router

A 30 minute talk plus a hands on workshop. It runs on **Cloudflare Workers AI**, so
there is nothing to install and you do not need a graphics card.

## What is in this folder

| File | What it is |
|---|---|
| `slides.html` | The slides. Open it in any browser. Use the arrow keys or click to move forward, press `F` for fullscreen, and add `#12` to the address to jump to slide 12. It remembers which slide you were on, so a refresh or a reopen puts you back. Press `Home` for the first slide, or `Shift+Home` to also clear that memory. |
| `../router/` | The workshop code, in TypeScript. Runs in a browser, on a server, or from the command line. See its own README. |
| `README.md` | This file. Setup, the exercise, notes for organizers, and the cost math. |

### The discussion slide holds its answer back

On the "one last example to discuss" slide, the second to last of the timed session,
the answer stays hidden until you press the arrow again, so the room
cannot read ahead while they are still deciding. The first press reveals it, the
second moves on. Going backwards shows it again rather than making you reveal it
twice.

You can do this on any slide. Put `data-reveal` on an element and it stays hidden
until you advance. Printing shows everything, since paper has no arrow key.

### The last few slides are reference

The 30 minutes ends on **"What you actually learned today"**, slide 19. Do not skip
that one to save a minute: it is the point of the whole session, the moment routing
stops being about AI models and becomes a shape they can reuse. Everything after it,
the feedback loop, the two honest caveats, what to do next and the tool comparison, is
there for people to read afterwards. The agenda slide says so. Do not try to present
all of it.

### One thing to check before you present

The slides load two fonts from Google. If there is no internet, they fall back to a
standard font and everything still works, it just looks slightly different. To be
safe, open the slides once on the presenting laptop while you have a connection so
the fonts get saved. If you want to be certain, download the two font files, put
them next to `slides.html`, and load them with an `@font-face` rule instead.

---

## Setup for participants

**There is no setup.** Send everyone to **<https://talks.ezcorp.org>** and have them
start typing. It works straight away using demo answers, so nobody has to install
anything, make an account, or wait on a download. Everything runs in their own
browser, so nothing they type reaches a server of ours.

The demo answers are not real model output, but everything else is real: the rules,
the checks, and moving up to a stronger model when a check fails. That is the part
the workshop is about.

The playground on that page has an **Advanced** section holding every rule, every
model, and the prompt the chooser is given. That is where the exercise happens for
anyone who would rather not clone the repository. Changes stay in their browser, and
there is a reset button, so nobody can break it for anyone else.

### To run the same code yourself

```bash
bun src/cli.ts --mock --demo    # demo answers, no key, no internet
bun src/cli.ts --demo           # real answers, needs the two variables below
bun src/cli.ts "your request"
```

You need [Bun](https://bun.sh), or Node version 22 and up:

```bash
node --experimental-strip-types src/cli.ts --mock --demo
```

For real answers, set two variables first:

```bash
export CF_ACCOUNT_ID="..."     # copy from the workshop slide
export CF_API_TOKEN="..."      # copy from the workshop slide
```

On Windows use `$env:CF_ACCOUNT_ID="..."` instead of `export`.

One honest note about cost: if your request does not match any rule, the chooser runs
to make the choice. That costs something, not nothing. `--mock` is the only mode that
is completely free.

---

## The models

| Name | Cloudflare model | What it is for | Cost a request |
|---|---|---|---|
| `FAST` | `@cf/meta/llama-3.2-3b-instruct` | Pulling out info, reformatting, summaries | $0.01 |
| `QUALITY` | `@cf/qwen/qwen3-30b-a3b-fp8` | Reading code, writing tests, multi step thinking | $0.05 |
| `PREMIUM` | `@cf/openai/gpt-oss-120b` | Design work, security, big changes | $0.20 |
| `HOLD` | *nothing is sent* | Legal, private, medical, confidential | $0 |
| *the chooser* | `@cf/meta/llama-3.1-8b-instruct` | Picks which one to use. Answers `{"lane": "FAST"}`. | small |

The slides say out loud that these prices are made up. If someone asks where they came
from: the gap between them is roughly what you see across AI companies, and the deck's
arithmetic only ever uses the gap.

All four model names were checked against Cloudflare's list. You can swap them
freely, since they are settings rather than code. The list changes often, so check it
again before your event:
<https://developers.cloudflare.com/workers-ai/models/>

### Why `HOLD` exists

An earlier version of this workshop ran models on your own laptop, where keeping
something private simply meant the text never left the machine. On Workers AI, every
model runs on Cloudflare's computers. So privacy stops being something you get for
free from the setup, and becomes **one more thing the program has to decide**. It is
a real option with real rules, and its whole job is to not send anything.

Worth saying out loud when you present: the slides no longer have a dedicated slide
explaining that the text leaves the room. `HOLD` still appears in the diagrams, but
nobody introduces it. Say the trade in one sentence when the models first come up.

---

## Cost math, worth reading before the workshop

**The free tier gives you 10,000 neurons per day for the whole account. It resets at
midnight UTC.** Neurons are how Cloudflare counts usage. Bigger models use more per
word.

Here is what the models in this workshop cost:

| Model | Neurons per million words of output |
|---|---|
| `llama-3.1-8b-instruct` (the chooser) | 75,147 |
| `llama-3.2-3b-instruct` (FAST) | 30,475 |
| `qwen3-30b-a3b-fp8` (QUALITY) | 30,475 |
| `gpt-oss-120b` (PREMIUM) | 68,182 |

So the free 10,000 neurons buys you roughly **145,000 words of output if everything
went to PREMIUM**, or about 330,000 on the smaller models. That sounds like a lot,
but do the math for a room. Thirty people, about 20 requests each, at roughly 400
words per answer, is around 240,000 words spread across the models. That lands
**right at the daily limit with nothing to spare**. One person re-running the demo a
few times, or a handful of long PREMIUM answers, will push you over. When that
happens, everyone in the room is stuck at once.

One more thing worth knowing, because someone will notice: on Cloudflare, FAST and
QUALITY currently cost the same per word. The $0.01, $0.05 and $0.20 in the slides are
labelled as made up, and the real gap only shows up at PREMIUM, which is about 2.2
times the others. The speed and quality differences between the models are real. The
cost difference depends on which company you use.

### Why the chooser is not the cheapest model available

It used to be `llama-3.2-1b-instruct`, which is about four times cheaper. It was
changed because nothing on Workers AI below 8B supports **JSON Mode**, and without
it the chooser answers in prose that has to be searched for a lane name. That gets
the answer wrong in the expensive direction: a reply of "this is not PREMIUM, so
FAST" reads as PREMIUM, which is the most expensive lane there is. Paying a bit more
to be told `{"lane": "FAST"}` and have it be true is the better trade.

If someone asks what the chooser costs in practice: a classification is roughly 150
tokens in and 10 out, so about **4.6 neurons** on the 8B against 0.55 on the 1B. For
a room of thirty doing twenty requests each, where perhaps a third miss every rule,
that is around 900 neurons rather than 110, out of the 10,000 daily allowance. Real,
but not what runs you out. The answers do that.

Three ways to handle the limit, best first:

1. **Put the account on the paid plan.** Past the free amount it costs $0.011 per
   1,000 neurons. A thirty person workshop comes to a few dollars, and nothing can
   run out in the middle of your demo. This is the simple, sensible answer.
2. **Make two or three backup keys** on separate accounts and put one on a slide. If
   the first key stops working, everyone changes one line.
3. **Stay on the free tier and use only the small models,** with shorter answer
   limits. This is cheapest, but the quality difference between the models is the
   thing your demo is trying to show, and this mostly removes it. Only do this if the
   alternative is not running at all.

The code already limits how long each answer can be, and when you hit the daily limit
it shows a plain explanation pointing at these options instead of a wall of error
text.

Current prices and limits:
<https://developers.cloudflare.com/workers-ai/platform/pricing/>

---

## How the program decides

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

The rules run before the chooser on purpose. Rules are free, they behave the same
way every time, and a teammate can read them in a code review. You also do not want
a model deciding how careful to be about someone's password, or whether private text
is safe to send at all, which is why the chooser is never offered that option. Its
schema allows FAST, QUALITY and PREMIUM and nothing else, so `HOLD` stays a decision
a person wrote down.

---

## The exercise, 21 to 29 minutes

Most of the room does this in the browser: on <https://talks.ezcorp.org>, open
**Advanced** in the playground, which holds the same rule lists. The slide leads with
that, because nobody has cloned anything. Anyone running the code locally edits
`src/router/config.ts` instead. Either way: find `POLICY_RULES` or `TASK_RULES`
near the top, and add **one** pattern:

```ts
export const TASK_RULES: Rule[] = [
  // ... rules that are already there ...
  {
    lane: "QUALITY",
    reason: "Mentions a specific framework, so it needs real knowledge",
    patterns: [/\bDjango\b/i, /\bRails\b/i, /\bKubernetes\b/i],
  },
];
```

One thing to watch: never put the `/g` flag on a pattern. A global regular
expression remembers where it stopped last time, so it would match every other
request. There is a test that checks for this.

Then try it for free:

```bash
bun src/cli.ts --mock "Our Django page is loading slowly"
```

Pick the wording carefully when you demonstrate this. "Why is my Django page loading
so slowly?" already goes to QUALITY without any new rule, because `why is` is in the
QUALITY list. Someone would add a rule, see QUALITY, and learn nothing. The wording
above matches nothing at all until their rule exists.

The slide offers four ideas that are genuinely not in the file yet: `invoice` /
`refund` / `chargeback`, `privacy` / `home address`, `ELI5`, and `benchmark` /
`latency`. Steer people away from `production`, `medical`, `legal` and asking for
JSON, which are all already covered.

**Now try this one, and watch it do something you did not expect:**

```bash
bun src/cli.ts --mock "Why is my Django migration failing?"
```

That one goes to `PREMIUM`, not `QUALITY`. The word `migration` matches a safety
rule, and safety rules run first and win. Your new rule never even gets checked.

This is the most useful thing to notice all workshop. The order your rules run in is
invisible until it causes a problem, and word lists overlap in ways nobody plans for.
This is exactly why teams eventually move past hand written rules. Ask the room: is
sending anything with the word "migration" to the expensive model the right call
here, or did a rule written for database changes accidentally catch a question about
page loading?

### One last example to discuss

```
I need a plan to switch our login system over to passkeys
without locking out the people who already have accounts.
```

- Which model should handle this, or should a person handle it?
- Which of the six steps decides it, and does the chooser ever run?
- How would you check whether the answer is any good?
- Would you send this text to another company at all?

This is the comprehension check for the whole session, not a regular expression
puzzle. The answer you want back is the pipeline: a safety rule at step 1, so it
never reaches the chooser, and deciding cost nothing.

Then the honest half. One word did it: `passkey`. Nothing else in the request matches
anything — not "locking out", not "switch over", not "login system", which has no
pattern of its own. It lands on PREMIUM, which is right, on the strength of a single
word.

Ask the room what happens to the same request written as "move everyone to
phishing-resistant sign-in". No rule matches it, so it goes to the chooser. That is
the honest limit of word matching, and the reason the next section exists.

---

## Notes for organizers

### Before the event

Send participants a short message ahead of time:

> **Before the workshop:** you need nothing at all. The examples run in your browser.
> No installing, no accounts, no downloads.
>
> If you want to try it early, open <https://talks.ezcorp.org> and start typing. If
> you would rather run the code yourself, install [Bun](https://bun.sh) and use
> `bun src/cli.ts --mock --demo`.

Also:

- Send <https://talks.ezcorp.org>, and the repository link if people want the code.
- Decide the cost question above. If you are sharing one key, **test it the morning
  of the event**. Keys can be set up with the wrong permissions, and you only find
  out when you try to use one.
- The key needs **both** `Workers AI - Read` and `Workers AI - Edit` permissions.

### Replace the key afterwards

You are putting a working key on a projector in front of a room, and it will end up
in someone's photos. Assume it is public from that moment on. Delete it after the
session, and do not use that account for anything else.

### On the presenting laptop

Run `bun src/cli.ts --demo` once just before you start. The first request to a model
is slower than the rest, and this gets that out of the way. Also open <https://talks.ezcorp.org>
once so the browser has everything cached.

### Things to leave out

These are all worth learning later, but they take attention away from the main idea
in a 30 minute session:

Docker, LiteLLM setup, training your own models, dashboards, multi agent frameworks,
production monitoring, and build tooling.

### If the key stops working during the session

Demo answers run everything except the model call. The lesson about how routing works
survives completely. You only lose the real generated text. Say so plainly and keep
going. That looks far better than debugging an error message in front of thirty
people.

Because the site defaults to demo answers, most of the room will not even
notice.

---

## What to do after this

The program here decides using **rules you write by hand**. That is the right place
to start, because you can read the whole thing in one sitting. It is not where you
want to end up:

1. **Save every decision.** Those printed cards are the start of a useful record.
2. **Test a small share of traffic.** Send about 1 in 100 requests to every model and
   compare. This is how you find out your rules are wrong.
3. **Train a scoring model of your own** on that record. It predicts from the request
   alone whether the expensive model is worth it, and a threshold you set decides how
   often it says yes. That dial moves without retraining. What does need retraining is
   the model lineup, because it learns one pair: cheap against expensive.
4. **Rank your models instead.** Score every model for each request, adjust the
   balance of cost and quality afterwards, and add or remove models without starting
   over.
5. **Answer the repeats without asking anyone.** See the section below.
6. **Keep the option to hold things back.** A better model never replaces that.

The number to judge all of this by is not the lowest cost per request. It is the
**lowest cost per answer that is actually right**.

### Comparing meaning instead of words

The discussion slide says a request can become "a list of numbers", and someone will
ask what that is called. It is an **embedding**. A small model turns text into a few
hundred numbers, arranged so that text with a similar meaning gets similar numbers.
"Move everyone to phishing-resistant sign-in" lands near "passkeys" without sharing a
single word with it.

That is what the trained options on the four ways slide run on, and what the vLLM
Semantic Router in the tools table does. It is also the honest answer to the limit the
passkeys example exposes: a word list only catches the words you thought of.

### Answering the repeats without asking anyone

Item 5 above. Embed each request, keep the answers you have already paid for, and when
a new request lands close enough to an old one, return the saved answer. No model runs
at all. This is often the largest single saving available, and it is independent of
routing: it decides whether to send anything, not which model gets it.

It is deliberately not on a timed slide. Three traps, and you have to say them out loud
if someone asks:

1. **Close in meaning is not the same question.** "Reset my password" and "reset my
   password on iOS" embed almost identically and need different answers. The threshold
   you pick is a quality decision, not a tuning knob.
2. **Answers go stale.** The saved answer was right about last quarter's prices. Give
   every entry an expiry, and clear it when the thing it describes changes.
3. **One person's answer must never reach another person.** A shared cache is a privacy
   leak waiting to happen, and it sits badly next to `HOLD`. Key the cache per user, or
   only save requests that carry nothing personal.

There is a quieter fourth. A wrong answer that passes its check gets saved and then
served again and again, and the feedback loop never gets another chance to catch it.
Whatever expiry you choose, make a bad rating delete the entry.

None of this is in the workshop code. It is a direction on a take home slide, not
something you can demonstrate.

### The same idea works elsewhere

What this workshop really teaches is how to build something that **decides where work
should go**. Today the choices were AI models, but the shape of the program
(look at it, choose, check, try again, learn) does not care what the choices are.
The same shape, with different options and a different check:

| Sort these | Between | How you check |
|---|---|---|
| Requests *(today)* | fast, quality, premium, hold | check the answer, try again if needed |
| Jobs | chatbot, coding assistant, workflow tool | did it finish the job? |
| Tool choices | 40 tools, pick the right one | did it return what it promised? |
| Questions | your database, your documents, the web | did that source have the answer? |
| Support tickets | bot, support team, specialist, legal | how often does it get reopened? |
| Alerts | phone call, chat message, daily summary, ignore | did anyone actually act on it? |

Every row becomes automatic the same way. Connect the feedback loop from the take
home section, and bad results start improving the rules on their own. In the code, the `LANES` setting and the rule
lists are the whole idea. Change what an option means, and the rest still works.

---

## Notes on the slide design

`slides.html` follows the EZCorp guidelines. Dark background with warm greys, Space
Grotesk for headings and body text, JetBrains Mono for labels and code, and yellow
used for only one thing per slide.

**Why orange is not used for a model.** The obvious choice would be yellow, orange,
and red for the three models. But orange `#F29C1C` and yellow `#EEC216` are too close
together to tell apart reliably, even for people with normal colour vision, and worse
for people with colour blindness. On a projector they would look the same. So the
colours are:

| Name | Colour | Why |
|---|---|---|
| `FAST` | Blue `#3B9EF5` | Cool and calm, reads as the cheap option |
| `QUALITY` | Green `#2DBD72` | Clearly different from both neighbours |
| `PREMIUM` | Yellow `#EEC216` | The strongest colour for the strongest model |
| `HOLD` | Grey | Deliberately not a brand colour, because it is not a model |

Red is saved for failures and never used for decoration. Orange still appears where
the brand guide puts it, in code examples. These choices were tested with a colour
checking tool rather than judged by eye.

---

## Sources

The four approaches to building a router, the point about deciding before you spend,
and the argument for systems that keep learning all come from **"How to Build Your
Own Model Router"** by Tomás Hernando Kofman of Not Diamond, presented at AI Council:
<https://www.youtube.com/watch?v=ju7kKGVQRi0>

Model names and prices were checked against Cloudflare's Workers AI documentation.
The tools table came from company documentation and Not Diamond's
`awesome-ai-model-routing` list. Check it again before you commit to anything,
because this area changes quickly.

The prices in the slides are made up: a cent for FAST, five for QUALITY, twenty for
PREMIUM. They are not Cloudflare's real neuron prices, which are fractions of a cent
and would mean nothing to a room. What is meant to be real is the ratio between them.
If someone asks, say that: the shape of the gap is the claim, not the figures.
