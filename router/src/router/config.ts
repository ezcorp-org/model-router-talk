import type { JsonSchema } from "./clients/types.ts";
import type { Lane, LaneConfig, RouterConfig, Rule } from "./types.ts";

/**
 * The models we can choose from.
 *
 * These are Cloudflare Workers AI model names. Swap them freely. The whole
 * point of a router is that this is a setting, not code.
 * Full list: https://developers.cloudflare.com/workers-ai/models/
 */
export const LANES: Record<Lane, LaneConfig> = {
  FAST: {
    model: "@cf/meta/llama-3.2-3b-instruct",
    blurb: "Pulling out info, reformatting, summaries",
    cost: 1,
    maxTokens: 400,
  },
  QUALITY: {
    model: "@cf/qwen/qwen3-30b-a3b-fp8",
    blurb: "Reading code, writing tests, multi step thinking",
    cost: 5,
    maxTokens: 700,
  },
  PREMIUM: {
    model: "@cf/openai/gpt-oss-120b",
    blurb: "Design work, security, big changes",
    cost: 20,
    maxTokens: 900,
  },
  HOLD: {
    // Deliberately no model. When every model runs on someone else's
    // computer, "keep this private" can only mean "do not send it".
    model: null,
    blurb: "Legal, private, medical, confidential",
    cost: 0,
    maxTokens: 0,
  },
};

/**
 * The model that decides which lane to use when no rule matched.
 *
 * This one is chosen for a reason beyond size: it is on Cloudflare's JSON Mode
 * list, so it can be held to a schema and made to answer `{"lane": "FAST"}`
 * rather than a sentence we have to go looking through. A smaller 1B model is
 * cheaper, but nothing on Workers AI below 8B supports JSON Mode, and reading
 * a chatty reply by scanning it for a lane name gets the answer wrong in the
 * expensive direction: "this is not PREMIUM, so FAST" scans as PREMIUM, which
 * is twenty times the cost of the right answer.
 */
export const CLASSIFIER_MODEL = "@cf/meta/llama-3.1-8b-instruct";

/**
 * The shape the chooser must answer in.
 *
 * The enum is the important part: it is not a request, it is the set of values
 * the model is allowed to produce. HOLD is deliberately absent. Whether
 * something is too sensitive to send is a decision for a rule a person wrote
 * and can be shown in a code review, never for a model.
 */
export const CLASSIFIER_SCHEMA = {
  type: "object",
  properties: {
    lane: {
      type: "string",
      enum: ["FAST", "QUALITY", "PREMIUM"],
      description: "Which lane should handle this request",
    },
  },
  required: ["lane"],
} as const satisfies JsonSchema;

/**
 * Safety rules. These run first and win outright.
 *
 * They are not a model's judgement call. If a request touches money,
 * passwords or someone's legal standing, we do not want a 1B model deciding
 * how careful to be.
 */
export const POLICY_RULES: Rule[] = [
  {
    lane: "HOLD",
    reason: "Private or regulated content, so it must not be sent anywhere",
    patterns: [
      /\blegal\b/i, /\blawsuit\b/i, /\bmedical\b/i, /\bdiagnos/i,
      /\bHIPAA\b/i, /\bGDPR\b/i, /\bPII\b/i, /\bpatient\b/i,
      /\bfraud\b/i, /\bliability\b/i, /\bconfidential\b/i, /\bNDA\b/i,
      /\bsalary\b/i, /\bSSN\b/i,
    ],
  },
  {
    lane: "PREMIUM",
    reason: "Security, logins or payments, where mistakes are costly",
    patterns: [
      /\bsecurity\b/i, /\bsecure\b/i, /\bauth(entication|orization)?\b/i,
      /\bpassword\b/i, /\bpasskey/i, /\bcredential/i, /\bencrypt/i,
      /\btoken\b/i, /\bOAuth\b/i, /\bpayment/i, /\bbilling\b/i,
      /\bPCI\b/i, /\bvulnerab/i, /\bexploit\b/i,
    ],
  },
  {
    lane: "PREMIUM",
    reason: "Touches live systems, so the damage from a bad answer is real",
    patterns: [
      /\bproduction\b/i, /\bprod\b/i, /\bmigrat(e|ion)\b/i,
      /\brollback\b/i, /\boutage\b/i, /\bincident\b/i, /\bdata loss\b/i,
    ],
  },
];

/**
 * Job type rules. Cheap, obvious signals, so we skip the classifier.
 */
export const TASK_RULES: Rule[] = [
  {
    lane: "FAST",
    reason: "Simple job with a predictable answer, and easy to check",
    patterns: [
      /\bextract\b/i, /\bsummar(ize|ise|y)\b/i, /\breformat\b/i,
      // Cover how people really ask for this, not just the formal verb.
      // "pull the to-do items out of", "list the action items".
      /\bpull\b[^.?!]*\bout of\b/i,
      /\b(to-?do|action)\s+items?\b/i,
      /\blist\b[^.?!]*\b(items?|points?|names?)\b/i,
      /\bto JSON\b/i, /\bas JSON\b/i, /\btag\b/i, /\blabel\b/i,
      /\bbullet points?\b/i, /\btranslate\b/i, /\bspell/i,
      /\bTL;?DR\b/i,
    ],
  },
  {
    lane: "QUALITY",
    reason: "The model has to understand code and think in steps",
    patterns: [
      /\brefactor\b/i, /\bcode review\b/i,
      // Match how people actually phrase this, not one exact wording.
      // "Review this function", "read this code", "look at this PR".
      /\b(review|read|look at|check) (this|the|my) (function|code|file|PR|method|script)\b/i,
      /\bsuggest\b[^.?!]*\btests?\b/i,
      /\bedge case/i, /\bunit test/i, /\btest cases?\b/i, /\bdebug\b/i,
      /\bwhy (does|is|isn't|are|am)\b/i, /\bregression\b/i,
    ],
  },
  {
    lane: "PREMIUM",
    reason: "Open ended design work with a lot of moving parts",
    patterns: [
      /\bdesign a\b/i, /\barchitect/i, /\bsystem design\b/i,
      /\btrade-?offs?\b/i, /\bscal(e|ing) strategy\b/i, /\bdistributed\b/i,
    ],
  },
];

/** Requests longer than this go to QUALITY without asking the small model. */
export const LONG_REQUEST_CHARS = 1000;

/** What we tell the chooser when we ask it to pick a lane. */
export const CLASSIFIER_SYSTEM = `You are a routing classifier inside a model router.
Classify the DIFFICULTY of the user's request. You do NOT answer it.

FAST     - routine, constrained, one obvious correct shape of answer
QUALITY  - needs real reasoning, domain knowledge, or multi-step work
PREMIUM  - open-ended, high-consequence, many interacting constraints

Answer with JSON: {"lane": "FAST"}`;

/**
 * The settings above, gathered into one value.
 *
 * Everything that routes takes a config and falls back to this one, so the
 * behaviour with no config is exactly the behaviour the slides describe.
 */
export const DEFAULT_CONFIG: RouterConfig = {
  lanes: LANES,
  policyRules: POLICY_RULES,
  taskRules: TASK_RULES,
  longRequestChars: LONG_REQUEST_CHARS,
  classifierModel: CLASSIFIER_MODEL,
  classifierSystem: CLASSIFIER_SYSTEM,
  classifierSchema: CLASSIFIER_SCHEMA,
};
