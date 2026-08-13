/**
 * A pass through Worker so the browser demo can reach Workers AI.
 *
 * WHY THIS EXISTS
 * ---------------
 * api.cloudflare.com does not send CORS headers, so a webpage cannot call it
 * directly. The browser blocks the request before it is even sent. This Worker
 * is the smallest thing that fixes that.
 *
 * WHAT IT DOES
 * ------------
 * It takes the visitor's own Cloudflare token from the Authorization header,
 * forwards the request to Workers AI, and adds the CORS headers the browser
 * needs. That is all.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It never stores, logs or looks at the token. It holds no key of its own, so
 * if someone finds the URL there is nothing to steal and nothing to bill you
 * for. A request without a token simply fails.
 *
 * DEPLOY
 * ------
 *   npx wrangler deploy worker/proxy.ts --name router-proxy --compatibility-date 2026-01-01
 *
 * Then set ALLOWED_ORIGINS below to your own site.
 */

/**
 * Only these sites may use the proxy. Keep this tight.
 *
 * The first one is where the site actually lives. Miss it and every request
 * from the real page is rejected as a forbidden origin, which reads like a
 * broken key rather than a missing line in this list.
 */
const ALLOWED_ORIGINS = [
  "https://talks.ezcorp.org", // the site
  "http://localhost:5173", // vite dev
  "http://localhost:4173", // vite preview
];

/** Only these models may be requested, so nobody can use this to run anything. */
const ALLOWED_MODELS = new Set([
  "@cf/meta/llama-3.1-8b-instruct", // the chooser. on Cloudflare's JSON Mode list
  "@cf/meta/llama-3.2-3b-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/openai/gpt-oss-120b",
]);

const UPSTREAM = "https://api.cloudflare.com/client/v4";

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get("Origin") ?? "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (!cors["Access-Control-Allow-Origin"]) {
      return json({ error: "This site is not allowed to use the proxy." }, 403, cors);
    }
    if (request.method !== "POST") {
      return json({ error: "Use POST." }, 405, cors);
    }

    // Expect /accounts/<id>/ai/run/@cf/<vendor>/<model>
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/accounts\/([a-f0-9]{6,64})\/ai\/run\/(.+)$/i);
    if (!match) {
      return json({ error: "Unexpected path." }, 400, cors);
    }
    const [, accountId, model] = match as unknown as [string, string, string];

    if (!ALLOWED_MODELS.has(decodeURIComponent(model))) {
      return json({ error: `Model ${model} is not on the allow list.` }, 400, cors);
    }

    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) {
      return json({ error: "Add your own Cloudflare token." }, 401, cors);
    }

    // Cap the request body so nobody can push a huge prompt through.
    const body = await request.text();
    if (body.length > 20_000) {
      return json({ error: "That request is too large." }, 413, cors);
    }

    const upstream = await fetch(`${UPSTREAM}/accounts/${accountId}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body,
    });

    // Pass the answer straight back, with CORS added.
    const headers = new Headers(cors);
    headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

function corsHeaders(origin: string): Record<string, string> {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
