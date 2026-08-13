/**
 * Which page we are on, from the address bar.
 *
 * Hash based on purpose. GitHub Pages serves static files with no rewrite
 * rule, so a visitor who reloads on /playground, or opens a link someone sent
 * them, would get a 404. Everything after the # stays on the client, so one
 * HTML file covers every route and links survive being shared.
 */

export type Route = "home" | "playground";

/**
 * The route in the address bar, or null when the hash is not a route at all.
 *
 * Only "#/" shaped hashes are routes. A bare "#main" is an in-page anchor,
 * which is what the skip link uses, and reading it as a route sent anyone
 * pressing "Skip to content" from the playground back to the overview.
 */
function parse(): Route | null {
  const hash = globalThis.location?.hash ?? "";
  if (!hash.startsWith("#/")) return null;
  const raw = hash.replace(/^#\/?/, "").split("?")[0];
  return raw === "playground" ? "playground" : "home";
}

class Router {
  current = $state<Route>(parse() ?? "home");

  constructor() {
    globalThis.addEventListener?.("hashchange", () => {
      const next = parse();
      // An anchor is not a navigation. Leave the page, and the scroll, alone.
      if (next === null) return;
      this.current = next;
      // A new page should start at the top, the way a real navigation would.
      globalThis.scrollTo?.({ top: 0, behavior: "instant" as ScrollBehavior });
    });
  }

  go(route: Route) {
    globalThis.location.hash = route === "home" ? "/" : `/${route}`;
  }
}

export const router = new Router();

/** Href for a route, so links are real links and open in a new tab properly. */
export function href(route: Route): string {
  return route === "home" ? "#/" : `#/${route}`;
}
