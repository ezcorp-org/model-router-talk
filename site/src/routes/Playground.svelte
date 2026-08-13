<script lang="ts">
  import { tick } from "svelte";
  import {
    MockClient,
    ModelError,
    route,
    WorkersAIClient,
    type ModelClient,
    type RouteCard as Card,
  } from "../../../router/src/router/index.ts";
  import ClassifierEditor from "../lib/ClassifierEditor.svelte";
  import { config } from "../lib/configStore.svelte.ts";
  import KeyPanel from "../lib/KeyPanel.svelte";
  import LaneEditor from "../lib/LaneEditor.svelte";
  import RouteCard from "../lib/RouteCard.svelte";

  /**
   * Four requests, each landing somewhere different.
   *
   * The labels name the job rather than the machinery, because there is only
   * one piece of machinery left: every request here is read by the chooser.
   * What changes between them is the answer it gives.
   *
   * "The check fails" is the one to watch. It is the only example that does
   * more than one thing: the small model mangles the JSON, the check catches
   * it, and the router tries again a lane up.
   */
  const EXAMPLES = [
    { label: "An easy job", prompt: "Pull the to-do items out of these meeting notes: Ana updates the pricing page by Friday. Ben is blocked on the sandbox key." },
    { label: "Needs real thinking", prompt: "Read this function and suggest five tests: function splitBill(total, people) { return total / people; }" },
    { label: "High stakes", prompt: "Design a safe password reset process for a consumer app." },
    { label: "The check fails", prompt: "Give me the settings as JSON." },
  ];

  let prompt = $state(EXAMPLES[0]!.prompt);
  let card = $state<Card | null>(null);
  let running = $state(false);
  let problem = $state<{ message: string; hint: string } | null>(null);
  let liveNote = $state("");
  let advanced = $state(false);

  // Bring your own key. Held in memory only, never written anywhere.
  let accountId = $state("");
  let apiToken = $state("");
  let proxyUrl = $state("");
  let useReal = $state(false);

  let controller: AbortController | null = null;

  /** True while the box still holds one of the examples, word for word. */
  const isExample = $derived(EXAMPLES.some((e) => e.prompt === prompt.trim()));

  /**
   * Whether to warn that the answer is not from a model.
   *
   * Only for a request the visitor wrote. The examples have demo answers that
   * fit them, so nothing looks wrong. Type your own and the demo client replies
   * with the same generic paragraph regardless, which reads as the router being
   * broken rather than as there being no model connected. Set when Send is
   * pressed, not as you type, so the box does not nag at the keyboard.
   */
  let unreal = $state(false);

  /** The key fields, so "Connect a key" can actually take you to them. */
  let keySection = $state<HTMLElement | null>(null);

  const client = $derived.by((): ModelClient => {
    if (useReal && accountId.trim() && apiToken.trim() && proxyUrl.trim()) {
      try {
        return new WorkersAIClient({ accountId, apiToken, baseUrl: proxyUrl.trim() });
      } catch {
        return new MockClient();
      }
    }
    return new MockClient();
  });

  /** The config the last run used, so the card cannot describe a since-edited router. */
  let ranWith = $state(config.compiled);

  async function run() {
    if (!prompt.trim() || running) return;
    controller?.abort();
    controller = new AbortController();

    running = true;
    problem = null;
    card = null;
    unreal = false;
    ranWith = config.compiled;
    liveNote = "Asking the chooser which model to use";

    try {
      const result = await route(prompt, client, {
        config: ranWith,
        signal: controller.signal,
        onDecision: ({ decision }) => {
          unreal = !client.sendsData && !isExample;
          liveNote = `Chose ${decision.lane}. Waiting for the answer.`;
        },
        onAttempt: (attempt) => {
          liveNote = attempt.check.ok
            ? `${attempt.lane} passed the check.`
            : `${attempt.lane} failed the check. Trying the next model up.`;
        },
      });
      card = result;
      liveNote = `Done. Answered by ${result.finalLane}.`;
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      problem =
        err instanceof ModelError
          ? { message: err.message, hint: err.hint }
          : {
              message: "Something went wrong",
              hint: (err as Error)?.message ?? "Try again, or switch back to demo answers.",
            };
      liveNote = "That did not work.";
    } finally {
      running = false;
    }
  }

  /**
   * Open Advanced and take the reader to the key fields.
   *
   * Opening alone is not enough: the panel is a screen and a half below, so it
   * would look like the button did nothing.
   */
  async function openKeys() {
    advanced = true;
    await tick();
    keySection?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  function handleKey(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") run();
  }
</script>

<section class="intro">
  <p class="eyebrow">Playground</p>
  <h1>Send it somewhere.</h1>
  <p>
    Pick a request or write your own. A small model reads it, picks one of three
    lanes, and the answer comes back from whichever model that lane names. If the
    answer fails its check, the router tries again a lane up.
  </p>
</section>

<div class="work">
  <!-- Examples on the left, as a list rather than a row of chips: each one is
       here to show a different thing, and a label says which. -->
  <aside class="picks">
    <h2>Try one</h2>
    <ul>
      {#each EXAMPLES as example (example.prompt)}
        <li>
          <button
            class="pick"
            class:active={prompt === example.prompt}
            disabled={running}
            onclick={() => (prompt = example.prompt)}
          >
            <span class="pick-label">{example.label}</span>
            <span class="pick-text">{example.prompt}</span>
          </button>
        </li>
      {/each}
    </ul>
  </aside>

  <div class="run">
    <label>
      <span class="visually-hidden">Your request</span>
      <textarea
        bind:value={prompt}
        onkeydown={handleKey}
        rows="4"
        placeholder="Type any request and see which model it goes to"
        disabled={running}
      ></textarea>
    </label>

    <div class="actions">
      <button class="btn" onclick={run} disabled={running || !prompt.trim()}>
        {running ? "Working…" : "Send it"}
      </button>
      <span class="hint">Ctrl or Cmd + Enter</span>
      <span class="source">{client.sendsData ? "real answers" : "demo answers"}</span>
    </div>

    <p class="live" aria-live="polite">{liveNote}</p>

    {#if problem}
      <div class="problem" role="alert">
        <strong>{problem.message}</strong>
        <span>{problem.hint}</span>
      </div>
    {/if}

    <!--
      Your own request, no key connected. The examples are left alone because
      their demo answers suit them and nothing reads as broken. Type your own
      and the same generic paragraph comes back regardless, which looks like a
      fault rather than like there being no model on the other end.

      Worth being exact about what is fake here. With the rules gone, the lane
      on demo answers comes from a stand-in as well, so claiming "the routing is
      real" would no longer be true.
    -->
    {#if unreal}
      <div class="unreal" role="status">
        <strong>No model was asked anything.</strong>
        <span>
          No Cloudflare key is connected, so the lane was picked by a stand-in rather than
          by a model, and the answer is fixed demo text that ignores what you wrote. The
          checks below are real, and so is moving up a lane when one fails.
        </span>
        <button class="btn ghost tiny" onclick={openKeys}>Connect a key</button>
      </div>
    {/if}

    {#if card}
      <RouteCard {card} config={ranWith} />

      {#if card.text}
        <div class="answer">
          <h3>The answer</h3>
          <pre>{card.text}</pre>
        </div>
      {/if}
    {/if}
  </div>
</div>

<!--
  Everything that can be configured lives behind one button, closed by default.
  Open, it is a lot of dials; closed, the page is a prompt and an answer. Anyone
  who wants the dials will press the button, and nobody else has to look at them.
-->
<section class="advanced">
  <button
    class="disclose"
    aria-expanded={advanced}
    aria-controls="advanced-panel"
    onclick={() => (advanced = !advanced)}
  >
    <span class="chev" class:open={advanced}>›</span>
    <span class="disclose-text">
      <strong>Advanced</strong>
      <span>Change the models or the wording the chooser reads, or connect a real Cloudflare key. Nothing here is needed to understand what the router does.</span>
    </span>
    {#if config.edited}<span class="badge y">edited</span>{/if}
  </button>

  {#if advanced}
    <div class="panel" id="advanced-panel">
      <div class="panel-head">
        <p class="note">
          Which model each lane uses is a setting, not code. So is the wording the chooser
          reads before it picks one. Everything here stays in this browser.
        </p>
        {#if config.edited}
          <button class="btn ghost tiny" onclick={() => config.reset()}>
            Reset to defaults
          </button>
        {/if}
      </div>

      {#if config.problem}
        <div class="problem" role="alert">
          <strong>That will not compile, so the router is still using the last good version.</strong>
          <span>{config.problem.message}</span>
        </div>
      {/if}

      <div class="panel-body">
        <LaneEditor />
        <ClassifierEditor />

        <!--
          Connecting a real key is setup, not routing. It lives down here so
          the default page never has to explain CORS or proxies to someone who
          only came to see how a router decides things.
        -->
        <section class="keys" bind:this={keySection}>
          <h3>Real answers</h3>
          <p class="note">
            Everything above works on demo answers with no key and no network. This is
            only for seeing real model output.
          </p>
          <KeyPanel bind:accountId bind:apiToken bind:proxyUrl bind:useReal />
        </section>
      </div>
    </div>
  {/if}
</section>

<style>
  .intro {
    margin-bottom: 2.2rem;
  }
  .intro h1 {
    margin: 0.9rem 0 1rem;
  }

  .work {
    display: grid;
    grid-template-columns: minmax(0, 20rem) minmax(0, 1fr);
    gap: 2.5rem;
    align-items: start;
  }

  /* ---- examples, left ---- */

  .picks h2 {
    font-family: var(--mono);
    font-size: 0.68rem;
    font-weight: 500;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--dimmer);
    margin-bottom: 0.7rem;
  }
  .picks ul {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .pick {
    display: block;
    width: 100%;
    text-align: left;
    background: var(--s1);
    border: 1px solid var(--border);
    border-left: 3px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    cursor: pointer;
  }
  .pick:hover:not(:disabled) {
    border-color: var(--dim);
    border-left-color: var(--dim);
  }
  .pick.active {
    border-color: var(--yellow);
    border-left-color: var(--yellow);
  }
  .pick:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .pick-label {
    display: block;
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dim);
    margin-bottom: 0.25rem;
  }
  .pick.active .pick-label {
    color: var(--yellow);
  }
  .pick-text {
    display: block;
    font-size: 0.8rem;
    line-height: 1.45;
    color: var(--subtle);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ---- run, right ---- */

  .run {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  textarea {
    font-family: var(--sans);
    font-size: 0.95rem;
    padding: 0.8rem 0.9rem;
    border-radius: 8px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    flex-wrap: wrap;
  }
  .hint,
  .live,
  .source {
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--dim);
  }
  .source {
    margin-left: auto;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.64rem;
    color: var(--dimmer);
  }
  .live {
    min-height: 1.2em;
    margin-top: -0.4rem;
  }

  .problem {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: rgba(219, 37, 71, 0.1);
    border: 1px solid rgba(219, 37, 71, 0.4);
    border-radius: 8px;
    padding: 0.7rem 0.9rem;
    font-size: 0.82rem;
  }
  .problem strong {
    color: var(--red);
  }
  .problem span {
    color: var(--subtle);
  }

  /* Not an error, so not red. A note, in the accent the deck uses for
     "this is the bit to look at". */
  .unreal {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
    background: rgba(238, 194, 22, 0.07);
    border: 1px solid rgba(238, 194, 22, 0.35);
    border-radius: 8px;
    padding: 0.8rem 0.95rem;
    font-size: 0.82rem;
  }
  .unreal strong {
    color: var(--yellow);
  }
  .unreal span {
    color: var(--subtle);
    line-height: 1.55;
    max-width: 62ch;
  }
  .unreal .btn {
    margin-top: 0.3rem;
  }

  .answer {
    background: var(--s1);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.9rem 1.1rem;
  }
  .answer h3 {
    margin-bottom: 0.5rem;
    font-size: 0.68rem;
  }
  .answer pre {
    background: none;
    border: none;
    padding: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--subtle);
  }

  /* ---- advanced ---- */

  .advanced {
    margin-top: 3rem;
    border-top: 1px solid var(--border);
    padding-top: 1.5rem;
  }

  .disclose {
    display: flex;
    align-items: flex-start;
    gap: 0.8rem;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }
  .chev {
    font-family: var(--mono);
    font-size: 1.2rem;
    line-height: 1.1;
    color: var(--yellow);
    transition: transform 0.16s ease;
    flex: 0 0 auto;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
  .disclose-text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .disclose-text strong {
    color: var(--text);
    font-size: 0.98rem;
    font-weight: 600;
  }
  .disclose-text span {
    font-size: 0.82rem;
    color: var(--dim);
    line-height: 1.5;
    max-width: 62ch;
  }
  .disclose:hover .disclose-text strong {
    color: var(--yellow);
  }
  .disclose .badge {
    margin-left: auto;
    flex: 0 0 auto;
  }

  .panel {
    margin-top: 1.8rem;
  }
  .panel-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.4rem;
  }
  .panel-head .note {
    font-size: 0.8rem;
  }

  /* One column now the rule editors are gone. Held to a readable measure
     rather than the page's full 82rem, which these narrow fields would
     otherwise stretch across. */
  .panel-body {
    max-width: 44rem;
  }

  .keys {
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border);
  }
  .keys h3 {
    margin-bottom: 0.35rem;
  }
  .keys .note {
    font-size: 0.8rem;
    margin-bottom: 1rem;
  }

  @media (max-width: 900px) {
    .work {
      grid-template-columns: 1fr;
      gap: 1.8rem;
    }
  }
</style>
