<script lang="ts">
  import { LANE_COLOURS } from "../../../router/src/router/index.ts";
  import type { Lane } from "../../../router/src/router/index.ts";
  import { config } from "./configStore.svelte.ts";

  /**
   * The three lanes this page can reach.
   *
   * HOLD is missing because only a safety rule can select it, and this page has
   * no rules. It is still in the config, and still in the router package that
   * the workshop uses, so it is left out of the list rather than out of the
   * config.
   */
  const LANES: Lane[] = ["FAST", "QUALITY", "PREMIUM"];
  const lanes = $derived(config.draft.lanes);

  function num(value: string, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }
</script>

<section class="lanes">
  <h3>The models</h3>
  <p class="note">
    Swap these freely. That is the point: which model handles what is a setting, not code.
    Names change often, so check Cloudflare's current list before an event.
  </p>

  <div class="grid">
    <span class="col-head">Lane</span>
    <span class="col-head">Model</span>
    <!-- Cents, not dollars, so the box takes whole numbers and the totals on a
         route card cannot drift the way adding up money in decimals does. -->
    <span class="col-head num">Cost, cents</span>
    <span class="col-head num">Max tokens</span>

    {#each LANES as lane (lane)}
      <span class="lane-chip" style="color: {LANE_COLOURS[lane]}">
        <i class="dot" style="background: {LANE_COLOURS[lane]}"></i>{lane}
      </span>

      <label>
        <span class="visually-hidden">{lane} model</span>
        <input
          type="text"
          value={lanes[lane].model ?? ""}
          spellcheck="false"
          autocomplete="off"
          oninput={(e) => config.updateLane(lane, { model: e.currentTarget.value })}
        />
      </label>

      <label class="num">
        <span class="visually-hidden">{lane} cost in cents per request</span>
        <input
          type="number"
          min="0"
          value={lanes[lane].cost}
          oninput={(e) => config.updateLane(lane, { cost: num(e.currentTarget.value, 0) })}
        />
      </label>

      <label class="num">
        <span class="visually-hidden">{lane} max tokens</span>
        <input
          type="number"
          min="0"
          value={lanes[lane].maxTokens}
          oninput={(e) =>
            config.updateLane(lane, { maxTokens: num(e.currentTarget.value, 0) })}
        />
      </label>
    {/each}
  </div>

  <label class="threshold">
    <span>Requests longer than this go straight to QUALITY</span>
    <input
      type="number"
      min="1"
      value={config.draft.longRequestChars}
      oninput={(e) => config.setLongRequestChars(num(e.currentTarget.value, 1000))}
    />
    <span class="unit">characters</span>
  </label>
</section>

<style>
  .lanes {
    margin-bottom: 2rem;
  }
  h3 {
    margin-bottom: 0.35rem;
  }
  .note {
    font-size: 0.8rem;
    margin-bottom: 1rem;
  }

  .grid {
    display: grid;
    grid-template-columns: 7.5rem 1fr 5rem 6.5rem;
    gap: 0.45rem 0.7rem;
    align-items: center;
  }
  .col-head {
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dimmer);
    padding-bottom: 0.2rem;
    border-bottom: 1px solid var(--border);
  }
  .col-head.num {
    text-align: right;
  }
  .num input {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  input {
    font-size: 0.78rem;
    padding: 0.35rem 0.5rem;
  }
  input:disabled {
    opacity: 0.35;
  }

  .threshold {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    margin-top: 1.2rem;
    font-size: 0.84rem;
    color: var(--subtle);
  }
  .threshold input {
    width: 6rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .unit {
    font-family: var(--mono);
    font-size: 0.74rem;
    color: var(--dim);
  }

  /* Narrow screens: let the row scroll sideways rather than hide a column.
     Hiding one would silently drop a setting the visitor had edited. */
  @media (max-width: 620px) {
    .lanes {
      overflow-x: auto;
    }
    .grid {
      min-width: 30rem;
    }
  }
</style>
