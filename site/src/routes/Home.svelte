<script lang="ts">
  import {
    DEFAULT_CONFIG,
    formatCost,
    LANE_COLOURS,
    previewDecision,
  } from "../../../router/src/router/index.ts";
  import { href } from "../lib/hashRoute.svelte.ts";
  import type { Lane } from "../../../router/src/router/index.ts";

  /**
   * How big each model is, in words.
   *
   * This page is about the idea, and `@cf/qwen/qwen3-30b-a3b-fp8` does not
   * teach anyone anything about routing. Which lane is small and which is large
   * does. The exact name is still there on hover, and in the playground.
   */
  const SIZE: Record<Lane, string> = {
    FAST: "a small model",
    QUALITY: "a mid sized model",
    PREMIUM: "a large model",
    HOLD: "no model at all",
  };

  const lanes = (Object.keys(DEFAULT_CONFIG.lanes) as Lane[]).map((lane) => ({
    lane,
    ...DEFAULT_CONFIG.lanes[lane],
    colour: LANE_COLOURS[lane],
    size: SIZE[lane],
  }));

  /**
   * Three example requests, with the lane worked out by the real router rather
   * than typed in by hand. If a rule changes, this changes with it, so the
   * front page cannot end up claiming something the code no longer does.
   */
  const SAMPLES = [
    "Pull the to-do items out of these meeting notes",
    "Design a safe password reset process",
    "Summarise this confidential salary review",
  ].map((prompt) => {
    const p = previewDecision(prompt);
    return {
      prompt,
      lane: p.kind === "rule" || p.kind === "length" ? p.lane : "QUALITY",
      why: p.kind === "rule" ? p.reason : "No rule matched, so the chooser decides",
    };
  });
</script>

<section class="hero">
  <p class="eyebrow">Right model. Right task.</p>
  <h1>Not every job<br />needs an expert.</h1>
  <p class="lead">
    Small models are quick and cheap. Large ones cost more and take longer, but handle hard
    problems better. Most of what people send an AI is easy. A <strong>model router</strong>
    is the part that decides which model handles each request, checks whether the answer was
    any good, and tries a stronger one when it was not.
  </p>
  <div class="actions">
    <a class="btn" href={href("playground")}>Try the router</a>
    <a class="btn ghost" href="/slides.html">Read the talk</a>
  </div>

  <!--
    Three of the deck's own examples, showing what the router does with them.
    Static on purpose: this is the promise, and the playground is where you
    get to argue with it.
  -->
  <div class="samples" aria-label="Three example requests and where they go">
    {#each SAMPLES as sample (sample.prompt)}
      <div class="sample" style="--lane: {LANE_COLOURS[sample.lane]}">
        <p class="ask">{sample.prompt}</p>
        <p class="verdict">
          <span class="lane-chip"
            ><i class="dot" style="background: {LANE_COLOURS[sample.lane]}"></i>{sample.lane}</span
          >
          <span class="why">{sample.why}</span>
        </p>
      </div>
    {/each}
  </div>
</section>

<section>
  <h2>Two bad options and one good one</h2>
  <table>
    <thead>
      <tr><th>Approach</th><th>What happens</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Send everything to the big model</td>
        <td>You pay far more than you need to, and everyone waits</td>
      </tr>
      <tr>
        <td>Send everything to the small model</td>
        <td>People start getting wrong answers, and nobody notices for a while</td>
      </tr>
      <tr class="mine">
        <td><strong>Route each request</strong></td>
        <td>Each one goes where it fits, and something checks the answer</td>
      </tr>
    </tbody>
  </table>
  <p class="note">
    The number to judge a router by is not the lowest cost per request. It is the lowest cost
    per answer that is <strong>actually right</strong>. One that halves your bill while getting
    8% more answers wrong has not saved you anything. It has moved the cost somewhere you are
    not counting.
  </p>
</section>

<section>
  <h2>The four choices</h2>
  <div class="lanes">
    {#each lanes as lane (lane.lane)}
      <div class="card lane-card" style="--lane: {lane.colour}">
        <span class="lane-chip"
          ><i class="dot" style="background: {lane.colour}"></i>{lane.lane}</span
        >
        <p>{lane.blurb}</p>
        <p class="meta" title={lane.model ?? "nothing is sent"}>
          {lane.size}
          <span class="cost"
            >{lane.cost === 0
              ? "nothing is sent, so nothing is spent"
              : `${formatCost(lane.cost)} a request`}</span
          >
        </p>
      </div>
    {/each}
  </div>
  <p class="note">
    <strong>Why HOLD exists.</strong> When every model runs on somebody else's computer, "keep
    this private" can only mean one thing: do not send it. It is a real option with real rules,
    and its entire job is to send nothing. Cost numbers are illustrative, as the slides say.
  </p>
</section>

<section>
  <h2>How it decides</h2>
  <div class="steps">
    <div class="card step">
      <span class="n">01</span>
      <h3>Safety rules</h3>
      <p>Security, privacy, legal, payments, production. Free, and always the same.</p>
    </div>
    <div class="card step">
      <span class="n">02</span>
      <h3>Job type rules</h3>
      <p>Clearly easy work, or clearly hard work. Also free.</p>
    </div>
    <div class="card step">
      <span class="n">03</span>
      <h3>Length check</h3>
      <p>Over {DEFAULT_CONFIG.longRequestChars} characters goes to QUALITY.</p>
    </div>
    <div class="card step">
      <span class="n">04</span>
      <h3>The chooser</h3>
      <p>Only for requests the rules did not cover. The only step that costs anything before an answer.</p>
    </div>
  </div>
  <p class="note">
    The order is deliberate. Rules run before the chooser because rules are free, they
    behave the same way every time, and a teammate can read them in a code review. You also do
    not want any model deciding how careful to be about someone's password.
  </p>
  <p class="cta">
    <a href={href("playground")}>Open the playground</a> to change any of this and watch the routing
    change as you type.
  </p>
</section>

<style>
  section {
    margin-bottom: clamp(3rem, 7vw, 5.5rem);
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    grid-template-areas:
      "eyebrow samples"
      "title   samples"
      "lead    samples"
      "actions samples";
    column-gap: clamp(2rem, 5vw, 4.5rem);
    align-content: start;
    padding: clamp(1rem, 4vw, 2.5rem) 0 clamp(2rem, 5vw, 3.5rem);
  }
  .hero .eyebrow {
    grid-area: eyebrow;
  }
  .hero h1 {
    grid-area: title;
    margin: 1.2rem 0 1.6rem;
  }
  .lead {
    grid-area: lead;
    font-size: clamp(1.05rem, 1.6vw, 1.4rem);
    color: var(--text);
    max-width: 52ch;
    line-height: 1.5;
  }
  .actions {
    grid-area: actions;
    display: flex;
    gap: 0.8rem;
    flex-wrap: wrap;
    margin-top: 2.2rem;
    align-items: start;
  }
  .actions .btn {
    text-decoration: none;
    display: inline-block;
  }

  .samples {
    grid-area: samples;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    align-self: center;
  }
  .sample {
    background: var(--s1);
    border: 1px solid var(--border);
    border-left: 3px solid var(--lane);
    border-radius: 10px;
    padding: 0.85rem 1rem;
  }
  .ask {
    font-size: 0.86rem;
    color: var(--subtle);
    max-width: none;
    line-height: 1.45;
  }
  .verdict {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-top: 0.55rem;
    padding-top: 0.55rem;
    border-top: 1px solid var(--s2);
    max-width: none;
  }
  .verdict .lane-chip {
    color: var(--lane);
    font-weight: 700;
    font-size: 0.72rem;
  }
  .why {
    font-size: 0.75rem;
    color: var(--dim);
    flex: 1 1 10rem;
    line-height: 1.45;
  }

  @media (max-width: 900px) {
    .hero {
      grid-template-columns: 1fr;
      grid-template-areas: "eyebrow" "title" "lead" "actions" "samples";
      row-gap: 0;
    }
    .samples {
      margin-top: 2.5rem;
    }
  }

  h2 {
    margin-bottom: 1.4rem;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin-bottom: 1.4rem;
    font-size: 0.95rem;
  }
  th {
    text-align: left;
    font-family: var(--mono);
    font-weight: 500;
    color: var(--subtle);
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    padding: 0 1.1rem 0.8rem 0;
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 0.75rem 1.1rem 0.75rem 0;
    border-bottom: 1px solid var(--s2);
    color: var(--subtle);
    vertical-align: top;
    line-height: 1.45;
  }
  tbody tr:last-child td {
    border-bottom: none;
  }
  tr.mine td {
    background: rgba(238, 194, 22, 0.06);
  }
  tr.mine td strong {
    color: var(--yellow);
  }

  .lanes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 1rem;
    margin-bottom: 1.4rem;
  }
  .lane-card {
    border-left: 3px solid var(--lane);
  }
  .lane-card p {
    font-size: 0.9rem;
    margin-top: 0.6rem;
    max-width: none;
  }
  .meta {
    font-family: var(--mono);
    font-size: 0.72rem !important;
    color: var(--dim);
    margin-top: 0.9rem !important;
    overflow-wrap: anywhere;
  }
  .cost {
    display: block;
    margin-top: 0.3rem;
    color: var(--dimmer);
  }

  .steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 1rem;
    margin-bottom: 1.4rem;
  }
  .step .n {
    font-family: var(--mono);
    font-size: 0.6rem;
    letter-spacing: 0.16em;
    color: var(--dimmer);
    display: block;
    margin-bottom: 0.5rem;
  }
  .step h3 {
    margin-bottom: 0.5rem;
    color: var(--text);
  }
  .step p {
    font-size: 0.88rem;
    max-width: none;
  }

  .cta {
    margin-top: 1.4rem;
    color: var(--subtle);
  }
</style>
