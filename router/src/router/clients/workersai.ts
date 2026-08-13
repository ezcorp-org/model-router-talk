import {
  ModelError,
  type GenerateRequest,
  type GenerateResult,
  type ModelClient,
} from "./types.ts";

export interface WorkersAIOptions {
  /** Cloudflare account ID. Visible in the dashboard URL. */
  accountId: string;
  /** A Workers AI token with both Read and Edit permission. */
  apiToken: string;
  /**
   * Where to send the request.
   *
   * IMPORTANT: api.cloudflare.com does not send CORS headers, so a browser
   * cannot call it directly. From a webpage, point this at your own small
   * pass through Worker (see worker/proxy.ts) which adds the CORS headers and
   * forwards the token without storing it.
   *
   * From Node, Bun or a Worker there is no CORS, so you can leave this alone.
   */
  baseUrl?: string;
}

const DEFAULT_BASE = "https://api.cloudflare.com/client/v4";

/**
 * Calls Cloudflare Workers AI.
 *
 * The token is only ever held in memory by whoever constructs this class. It
 * is sent as an Authorization header and nothing else is done with it.
 */
export class WorkersAIClient implements ModelClient {
  readonly label = "Cloudflare Workers AI";
  readonly sendsData = true;

  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly baseUrl: string;

  constructor(opts: WorkersAIOptions) {
    this.accountId = opts.accountId.trim();
    this.apiToken = opts.apiToken.trim();
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
    if (!this.accountId || !this.apiToken) {
      throw new ModelError(
        "Missing account ID or token",
        "Add your Cloudflare account ID and a Workers AI token to send real requests.",
      );
    }
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const url = `${this.baseUrl}/accounts/${this.accountId}/ai/run/${req.model}`;
    const messages = [
      ...(req.system ? [{ role: "system", content: req.system }] : []),
      { role: "user", content: req.prompt },
    ];

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          temperature: req.temperature ?? 0.3,
          max_tokens: req.maxTokens ?? 600,
          // Workers AI calls this JSON Mode. Only some models support it, and
          // the ones that do not simply ignore it, so the caller still has to
          // handle a reply that is not JSON.
          ...(req.jsonSchema
            ? { response_format: { type: "json_schema", json_schema: req.jsonSchema } }
            : {}),
        }),
        signal: req.signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
      throw new ModelError(
        `Could not reach ${this.baseUrl}`,
        "The request never arrived. If you are calling from a webpage, remember that " +
          "api.cloudflare.com blocks browser requests, so baseUrl has to point at your own proxy.",
      );
    }

    if (!res.ok) throw describeFailure(res.status, await safeText(res));

    const payload = (await res.json()) as CloudflareEnvelope;
    if (payload.success === false) {
      const first = payload.errors?.[0]?.message ?? "Unknown error";
      throw new ModelError(first, `Cloudflare rejected the request: ${first}`);
    }

    return {
      text: extractText(payload.result).trim(),
      seconds: (Date.now() - started) / 1000,
    };
  }
}

interface CloudflareEnvelope {
  success?: boolean;
  errors?: Array<{ message?: string }>;
  result?: unknown;
}

/**
 * Workers AI answers in more than one shape depending on the model, so check
 * for each. gpt-oss models can reply in the chat completions shape.
 */
function extractText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const r = result as Record<string, unknown>;

  if (typeof r.response === "string") return r.response;

  const choices = r.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const msg = (choices[0] as Record<string, unknown>)?.message;
    const content = (msg as Record<string, unknown>)?.content;
    if (typeof content === "string") return content;
  }

  if (Array.isArray(r.output)) {
    // Responses style: find the first text part anywhere in the output.
    for (const item of r.output) {
      const content = (item as Record<string, unknown>)?.content;
      if (Array.isArray(content)) {
        for (const part of content) {
          const text = (part as Record<string, unknown>)?.text;
          if (typeof text === "string") return text;
        }
      }
    }
  }
  return "";
}

function describeFailure(status: number, body: string): ModelError {
  if (status === 429) {
    return new ModelError(
      "Daily limit reached",
      "This account has used its free allowance for today. It resets at midnight UTC. " +
        "Switch back to demo answers, or use a different key.",
      429,
    );
  }
  if (status === 401 || status === 403) {
    return new ModelError(
      "Cloudflare rejected the key",
      "Check the account ID matches the token, and that the token has both " +
        "Workers AI Read and Workers AI Edit permission.",
      status,
    );
  }
  if (status === 404) {
    return new ModelError(
      "Model not found",
      "That model name is not available on this account. Model names change, so check " +
        "the current list in the Cloudflare docs.",
      404,
    );
  }
  return new ModelError(
    `Workers AI returned ${status}`,
    `Something went wrong on Cloudflare's side. ${body.slice(0, 160)}`,
    status,
  );
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
