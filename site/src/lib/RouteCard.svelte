<script lang="ts">
  import { formatCost, LANE_COLOURS } from "../../../router/src/router/index.ts";
  import type { RouteCard, RouterConfig } from "../../../router/src/router/index.ts";

  interface Props {
    card: RouteCard;
    /** The config it ran with, so the card names the model that actually ran. */
    config: RouterConfig;
  }
  let { card, config }: Props = $props();

  const colour = $derived(LANE_COLOURS[card.finalLane]);
  const startedAt = $derived(card.decision.lane);
  const movedUp = $derived(card.finalLane !== startedAt);

  /**
   * The chooser's answer, word for word.
   *
   * Every other row on this card is arithmetic you could redo yourself. This
   * one is a model's judgement, so showing the reply is what turns "trust us"
   * into "look": it is held to a shape, and the code reads one field out of it.
   * No prose, no guessing at what it meant.
   */
  const said = $derived(
    card.decision.mechanism.kind === "classifier" ? card.decision.mechanism.reply : undefined,
  );

  /** The only answers the schema permits, so the reply reads as one of a set. */
  const allowed = $derived(config.classifierSchema.properties.lane?.enum ?? []);

  /**
   * Why it went where it went.
   *
   * The router package has `describeMechanism`, which opens every classifier
   * line with "No rule matched". That is true of the CLI and of the router the
   * talk builds. It is not true here, where there are no rules to not match,
   * and it said the same thing twice besides. Each decision already carries a
   * reason that stands on its own, so this card shows that and nothing else.
   */
  const why = $derived(`${card.decision.reason}.`);
</script>

<div class="rc" style="--lane: {colour}">
  <dl>
    <dt>Request</dt>
    <dd class="prompt">{card.prompt}</dd>

    <dt>Chose</dt>
    <dd>
      <strong class="lane">{card.finalLane}</strong>
      {#if movedUp}<span class="dim">started with {startedAt}, then moved up</span>{/if}
    </dd>

    <dt>Why</dt>
    <dd>{why}</dd>

    {#if said}
      <dt>Chooser said</dt>
      <dd>
        <code class="said">{said}</code>
        <span class="said-note">
          It can only answer {allowed.join(", ")}, so the code reads
          <code>lane</code> and routes on it. No sentence to interpret.
        </span>
      </dd>
    {/if}

    {#each card.attempts as attempt (attempt.lane)}
      <dt>Check</dt>
      <!-- "Passed on FAST. passed the basic checks" said it twice. The lane,
           then what the check found, says it once. -->
      <dd class={attempt.check.ok ? "ok" : "bad"}>
        {attempt.lane} — {attempt.check.note}
      </dd>
    {/each}

    <dt>Cost</dt>
    <dd>
      {formatCost(card.cost)}{card.attempts.length > 1
        ? ` across ${card.attempts.length} tries`
        : ""}
      <span class="model">{config.lanes[card.finalLane].model}</span>
    </dd>
  </dl>
</div>

<style>
  /* The deck's .rc rule, kept in step with it. */
  .rc {
    background: var(--s1);
    border: 1px solid var(--border);
    border-left: 3px solid var(--lane);
    border-radius: 10px;
    padding: 1.1rem 1.3rem;
    font-family: var(--mono);
    font-size: 0.82rem;
    line-height: 1.85;
    color: var(--text);
  }
  dl {
    display: grid;
    grid-template-columns: 8rem 1fr;
    gap: 0 1rem;
    margin: 0;
  }
  dt {
    color: var(--dim);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .prompt {
    color: var(--subtle);
  }
  /* The model ID matters, but not enough to earn its own row. */
  .model {
    display: block;
    color: var(--dim);
    font-size: 0.92em;
  }
  /* The chooser's reply, shown as what it is: a small piece of JSON. */
  .said {
    display: inline-block;
    background: var(--s2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.1rem 0.5rem;
    color: var(--yellow);
    font-size: 0.95em;
  }
  .said-note {
    display: block;
    color: var(--dim);
    font-size: 0.92em;
    line-height: 1.6;
    margin-bottom: 0.3rem;
  }
  .said-note code {
    background: none;
    padding: 0;
    color: var(--subtle);
  }
  .lane {
    color: var(--lane);
    font-weight: 700;
  }
  .dim {
    color: var(--dim);
    margin-left: 0.5rem;
  }
  .ok {
    color: var(--success);
  }
  .bad {
    color: var(--red);
  }
  @media (max-width: 560px) {
    dl {
      grid-template-columns: 1fr;
    }
    dt {
      margin-top: 0.5rem;
    }
  }
</style>
