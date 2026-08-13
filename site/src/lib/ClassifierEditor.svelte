<script lang="ts">
  import { config } from "./configStore.svelte.ts";
</script>

<section class="classifier">
  <h3>The chooser</h3>
  <p class="note">
    The router pays a small model to pick a lane before it sends the request on. This
    wording is the whole of what that model is told, so it is where the routing on this
    page actually lives. Change it and send the same request again to see how much it
    moves.
  </p>

  <label class="model">
    <span>Model</span>
    <input
      type="text"
      value={config.draft.classifierModel}
      spellcheck="false"
      autocomplete="off"
      oninput={(e) => config.setClassifierModel(e.currentTarget.value)}
    />
  </label>

  <label class="prompt">
    <span class="prompt-head">
      System prompt
      {#if config.classifierEdited}
        <button class="link-btn" onclick={() => config.resetClassifierSystem()}>
          Put the original back
        </button>
      {/if}
    </span>
    <textarea
      rows="12"
      spellcheck="false"
      value={config.draft.classifierSystem}
      oninput={(e) => config.setClassifierSystem(e.currentTarget.value)}
    ></textarea>
  </label>

  <div class="schema">
    <span class="schema-head">And held to this shape</span>
    <pre>{JSON.stringify(config.draft.classifierSchema, null, 2)}</pre>
    <p class="note">
      The <code>enum</code> is the part that matters. It is not a request, it is the set
      of values the model is allowed to produce, so the answer parses by construction
      instead of being searched for something that looks right.
    </p>
    <p class="note">
      <strong>There is no option here for "do not send it".</strong> A router that keeps
      some requests private needs one, and it cannot be this: whether something is too
      sensitive to send has to be a rule a person wrote and can defend in a code review,
      not a model changing its mind. The talk builds that part.
    </p>
  </div>

  <p class="note">
    If a model ignores the schema and answers in prose, the router still reads it, on
    word boundaries and skipping any lane that is being denied, so "this is not PREMIUM,
    so FAST" comes out as FAST rather than PREMIUM. If nothing usable comes back it falls
    to QUALITY and says so on the card.
  </p>
  <p class="note">
    On demo answers the chooser is a stand-in, not a real model, so editing this changes
    nothing until you switch real answers on.
  </p>
</section>

<style>
  .classifier {
    margin-bottom: 2rem;
  }
  h3 {
    margin-bottom: 0.35rem;
  }
  .note {
    font-size: 0.8rem;
    margin-bottom: 1rem;
  }
  .note + .note {
    margin-top: -0.4rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.8rem;
    color: var(--subtle);
    margin-bottom: 1rem;
  }
  .model input {
    font-size: 0.78rem;
    padding: 0.35rem 0.5rem;
  }

  .prompt-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }
  .prompt-head .link-btn {
    font-size: 0.74rem;
  }

  textarea {
    font-size: 0.76rem;
    line-height: 1.65;
    padding: 0.7rem 0.8rem;
    tab-size: 2;
  }

  .schema {
    margin-bottom: 1rem;
  }
  .schema-head {
    display: block;
    font-family: var(--mono);
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--dimmer);
    margin-bottom: 0.35rem;
  }
  .schema pre {
    font-size: 0.72rem;
    line-height: 1.55;
    padding: 0.7rem 0.9rem;
    color: var(--subtle);
    margin-bottom: 0.7rem;
  }
  .schema .note + .note {
    margin-top: 0.5rem;
  }

  code {
    background: var(--s2);
    border-radius: 4px;
    padding: 0.1em 0.38em;
    font-family: var(--mono);
    font-size: 0.92em;
    color: var(--subtle);
    overflow-wrap: anywhere;
  }
</style>
