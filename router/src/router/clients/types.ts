/**
 * The one thing the router needs from the outside world: a way to send text
 * to a model and get text back.
 *
 * Everything else in this library is pure logic with no network access, which
 * is why the same code runs in a browser, in a Worker, and in a test.
 */

export interface GenerateRequest {
  model: string;
  prompt: string;
  /** Optional instructions given to the model before the prompt. */
  system?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Ask the model to answer as JSON matching this schema.
   *
   * When a provider supports it, this constrains what the model is allowed to
   * produce, so the answer parses by construction instead of being scanned for
   * something that looks right. Providers that do not support it should ignore
   * this, which means callers must still cope with a reply that is not JSON.
   */
  jsonSchema?: JsonSchema;
  /** Lets a UI cancel an in flight request. */
  signal?: AbortSignal;
}

/**
 * The small slice of JSON Schema we actually use.
 *
 * Readonly throughout so a schema can be declared `as const`, which is what
 * makes the enum a checked list of lane names rather than plain strings.
 */
export interface JsonSchema {
  readonly type: "object";
  readonly properties: Readonly<
    Record<string, { readonly type: string; readonly enum?: readonly string[]; readonly description?: string }>
  >;
  readonly required?: readonly string[];
}

export interface GenerateResult {
  text: string;
  /** How long the call took, in seconds. */
  seconds: number;
}

export interface ModelClient {
  /** A short name shown in the UI, e.g. "demo answers" or "Workers AI". */
  readonly label: string;
  /** False when the client never touches the network. */
  readonly sendsData: boolean;
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

/**
 * Thrown when a model call fails in a way worth showing the user.
 * `hint` is written for a person, not a developer.
 */
export class ModelError extends Error {
  readonly hint: string;
  readonly status?: number;

  constructor(message: string, hint: string, status?: number) {
    super(message);
    this.name = "ModelError";
    this.hint = hint;
    this.status = status;
  }
}
