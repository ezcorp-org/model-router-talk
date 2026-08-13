<script lang="ts">
  interface Props {
    accountId: string;
    apiToken: string;
    proxyUrl: string;
    /** True when the visitor has asked for real answers. */
    useReal: boolean;
  }
  let {
    accountId = $bindable(""),
    apiToken = $bindable(""),
    proxyUrl = $bindable(""),
    useReal = $bindable(false),
  }: Props = $props();

  let open = $state(false);

  const hasKey = $derived(accountId.trim().length > 0 && apiToken.trim().length > 0);
  const hasProxy = $derived(proxyUrl.trim().length > 0);
  /** Real answers need both. Without the proxy the browser blocks the request. */
  const ready = $derived(hasKey && hasProxy);

  // If either half goes away, drop back to demo answers rather than leaving a
  // switch on that cannot do anything.
  $effect(() => {
    if (!ready && useReal) useReal = false;
  });

  function clear() {
    accountId = "";
    apiToken = "";
    useReal = false;
  }
</script>

<div class="panel">
  <div class="row">
    <label class="toggle">
      <input type="checkbox" bind:checked={useReal} disabled={!ready} />
      <span>Use real models</span>
    </label>
    <button class="link-btn" onclick={() => (open = !open)}>
      {open ? "Hide setup" : "Add my Cloudflare key"}
    </button>
  </div>

  {#if useReal}
    <p class="note warn">
      Real requests are on. What you type will be sent to Cloudflare through your proxy,
      using your key.
    </p>
  {:else}
    <p class="note">
      You are seeing <strong>demo answers</strong>. The checks are real, and so is moving up
      a model when one of them fails. The lane itself is picked by a stand-in rather than by
      a model, and the answers are made up. Nothing leaves your browser.
    </p>
  {/if}

  {#if open}
    <div class="fields">
      <!--
        This warning is first on purpose. Cloudflare's API sends no CORS headers,
        so a key alone cannot work from a webpage: the browser refuses to send
        the request at all. Finding that out after typing a token, via a console
        error, is a miserable way to learn it.
      -->
      <div class="heads-up">
        <strong>A key on its own will not work here.</strong>
        <p>
          Cloudflare's API refuses requests that come from a webpage, so the browser blocks
          them before they are sent. Nothing on this page can change that. To get real
          answers you need a small pass-through proxy of your own, and its URL below.
        </p>
        <p>
          <code>router/worker/proxy.ts</code> in the repo is that proxy, in about 60 lines. It
          holds no key of its own, only allows the four models this workshop uses, and passes
          your token straight through without storing it. Deploy it once with
          <code>wrangler</code>, then paste the URL here.
        </p>
      </div>

      <label>
        <span>Account ID</span>
        <input
          type="text"
          bind:value={accountId}
          placeholder="from your Cloudflare dashboard URL"
          autocomplete="off"
          spellcheck="false"
        />
      </label>

      <label>
        <span>API token</span>
        <input
          type="password"
          bind:value={apiToken}
          placeholder="a Workers AI token, Read and Edit"
          autocomplete="off"
          spellcheck="false"
        />
      </label>

      <label>
        <span>Proxy URL <em>required for real answers</em></span>
        <input
          type="text"
          bind:value={proxyUrl}
          placeholder="https://router-proxy.you.workers.dev"
          autocomplete="off"
          spellcheck="false"
        />
      </label>

      {#if hasKey && !hasProxy}
        <p class="note missing" role="status">
          Key saved, but there is no proxy URL, so requests would be blocked. Staying on demo
          answers.
        </p>
      {/if}

      <p class="note">
        Your key stays in this browser tab. It is never saved, never sent to us, and gone when
        you close the tab. It goes to your proxy and on to Cloudflare, nowhere else.
      </p>

      <button class="link-btn" onclick={clear}>Clear my key</button>
    </div>
  {/if}
</div>

<style>
  .panel {
    background: var(--s1);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0.9rem 1.1rem;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text);
    font-size: 0.9rem;
    cursor: pointer;
  }
  .toggle input:disabled + span {
    color: var(--dim);
    cursor: default;
  }

  .note {
    font-size: 0.78rem;
    line-height: 1.55;
    margin-top: 0.6rem;
  }
  .warn {
    color: var(--yellow);
  }
  .missing {
    color: var(--orange);
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    margin-top: 0.9rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--border);
  }
  .fields > label {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    font-size: 0.8rem;
    color: var(--subtle);
  }
  .fields > label em {
    font-style: normal;
    font-family: var(--mono);
    font-size: 0.66rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--orange);
    margin-left: 0.5rem;
  }

  .heads-up {
    background: rgba(242, 156, 28, 0.08);
    border: 1px solid rgba(242, 156, 28, 0.35);
    border-radius: 8px;
    padding: 0.8rem 0.95rem;
  }
  .heads-up strong {
    color: var(--orange);
    font-size: 0.85rem;
    display: block;
    margin-bottom: 0.4rem;
  }
  .heads-up p {
    font-size: 0.78rem;
    line-height: 1.55;
    color: var(--subtle);
    max-width: none;
  }
  .heads-up p + p {
    margin-top: 0.5rem;
  }
  .heads-up code {
    background: var(--s2);
    border-radius: 4px;
    padding: 0.1em 0.38em;
    font-family: var(--mono);
    font-size: 0.92em;
    color: var(--text);
  }
</style>
