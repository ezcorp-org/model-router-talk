<script lang="ts">
  import { href, router } from "./lib/hashRoute.svelte.ts";
  import Home from "./routes/Home.svelte";
  import Playground from "./routes/Playground.svelte";

  /**
   * Move to the content without touching the address bar.
   *
   * The hash holds the route here, so letting the browser set it to "#main"
   * would overwrite "#/playground" and a reload would land somewhere else.
   * Focus, rather than only scroll, so the next Tab carries on from the
   * content, which is the entire point of a skip link.
   */
  function skipToContent(event: MouseEvent) {
    event.preventDefault();
    const main = document.getElementById("main");
    main?.focus();
    main?.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior });
  }
</script>

<a class="skip" href="#main" onclick={skipToContent}>Skip to content</a>

<header>
  <!--
    The address, not a brand. During the exercise the playground is often
    fullscreen, so the address bar is hidden and the deck slide carrying the
    URL is off screen. This line is then the only place it appears.
  -->
  <a class="logo" href={href("home")}>TALKS.EZCORP.ORG</a>
  <nav>
    <a href={href("home")} class:on={router.current === "home"}>Overview</a>
    <a href={href("playground")} class:on={router.current === "playground"}>Playground</a>
    <a href="/slides.html">Slides</a>
  </nav>
</header>

<main id="main" tabindex="-1">
  {#if router.current === "playground"}
    <Playground />
  {:else}
    <Home />
  {/if}
</main>

<footer>
  <p class="note">
    Everything on this page runs in your browser. There is no server of ours, so nothing
    you type is sent to us, stored by us, or logged by us.
  </p>
</footer>

<style>
  .skip {
    position: absolute;
    left: -9999px;
    top: 0;
    background: var(--yellow);
    color: var(--black);
    padding: 0.6rem 1rem;
    border-radius: 0 0 8px 0;
    z-index: 50;
    font-weight: 600;
  }
  .skip:focus {
    left: 0;
  }

  header {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    flex-wrap: wrap;
    padding: 0.9rem clamp(1.2rem, 5vw, 3.5rem);
    background: rgba(12, 11, 10, 0.86);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
  }

  .logo {
    font-family: var(--mono);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--dimmer);
    text-decoration: none;
  }
  .logo:hover {
    color: var(--subtle);
  }

  nav {
    display: flex;
    gap: 1.4rem;
  }
  nav a {
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dim);
    text-decoration: none;
    padding-bottom: 2px;
    border-bottom: 1px solid transparent;
  }
  nav a:hover {
    color: var(--text);
  }
  nav a.on {
    color: var(--yellow);
    border-bottom-color: var(--yellow);
  }

  main {
    padding: clamp(2rem, 5vw, 4rem) clamp(1.2rem, 5vw, 3.5rem);
    max-width: 82rem;
    margin: 0 auto;
  }
  /* Only ever focused by the skip link, where a ring around the whole page
     would be noise. The skip link itself is what shows the focus. */
  main:focus {
    outline: none;
  }

  footer {
    border-top: 1px solid var(--border);
    padding: 1.6rem clamp(1.2rem, 5vw, 3.5rem) 2.4rem;
    max-width: 82rem;
    margin: 0 auto;
  }
</style>
