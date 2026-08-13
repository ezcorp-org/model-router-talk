/**
 * The visitor's router settings.
 *
 * The editable copy is the serialized one, because that is what a text box
 * holds: patterns as strings. The compiled copy is derived from it, and only
 * replaced when the whole thing compiles. That way a half typed pattern shows
 * an error next to the box instead of breaking the router underneath it.
 */

import {
  compileConfig,
  DEFAULT_CONFIG,
  RuleError,
  serializeConfig,
  type Lane,
  type RouterConfig,
  type SerializedRouterConfig,
} from "../../../router/src/router/index.ts";

/**
 * Bump this when the shape or the meaning of a stored config changes.
 *
 * An older saved copy is dropped rather than migrated. A config that is missing
 * a field does not throw, it just quietly behaves differently: one without
 * `classifierSchema` would stop asking for JSON and fall back to reading prose,
 * which is the failure this key exists to prevent anyone from meeting.
 *
 * v3 drops the rules. Anyone who used this page before has rule sets saved
 * under v2, and those would compile straight back in and restore the routing
 * this page no longer does.
 */
const SAVE_KEY = "ezcorp-router-config-v3";

/** Deep copy without structuredClone, which some older browsers still lack. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The playground's router: the default one, with no rules.
 *
 * The rules are still in the router package, still tested, and still what the
 * CLI and the deck describe. They are removed here because this page exists to
 * show one thing, a model choosing a lane, and every request that a pattern
 * caught was a request the chooser never got to answer.
 */
const PRISTINE = serializeConfig({ ...DEFAULT_CONFIG, policyRules: [], taskRules: [] });

/**
 * Read the saved config.
 *
 * Wrapped in try/catch the same way the deck guards its saved slide: some
 * embedded viewers block storage, and a blocked call must not stop the page
 * from working. Anything that does not compile is discarded rather than
 * shown, because a visitor cannot fix a config they cannot see.
 */
function load(): SerializedRouterConfig {
  try {
    const raw = globalThis.localStorage?.getItem(SAVE_KEY);
    if (!raw) return clone(PRISTINE);
    const parsed = JSON.parse(raw) as SerializedRouterConfig;
    // A missing field is not an error, so check for one before trusting it.
    if (!parsed?.classifierSchema?.properties?.lane) return clone(PRISTINE);
    compileConfig(parsed); // if this throws, the saved copy is unusable
    return parsed;
  } catch {
    return clone(PRISTINE);
  }
}

class ConfigStore {
  /** What the editor edits. */
  draft = $state<SerializedRouterConfig>(load());

  /** The last version that compiled. The router only ever sees this. */
  compiled = $state<RouterConfig>(DEFAULT_CONFIG);

  /** Why the draft will not compile, if it will not. */
  problem = $state<{ message: string; pattern: string } | null>(null);

  constructor() {
    this.recompile();
  }

  /** True when the visitor has changed anything from the defaults. */
  get edited(): boolean {
    return JSON.stringify(this.draft) !== JSON.stringify(PRISTINE);
  }

  /**
   * Try to compile the draft, save it if it works, and record why if not.
   * Call this after every edit. It is cheap: a few dozen small regexes.
   */
  recompile(): void {
    try {
      this.compiled = compileConfig(this.draft);
      this.problem = null;
      this.save();
    } catch (err) {
      this.problem =
        err instanceof RuleError
          ? { message: err.message, pattern: err.pattern }
          : { message: (err as Error).message, pattern: "" };
    }
  }

  private save(): void {
    try {
      globalThis.localStorage?.setItem(SAVE_KEY, JSON.stringify(this.draft));
    } catch {
      // Storage blocked or full. The page keeps working; the edit just will
      // not survive a refresh, which is not worth interrupting anyone over.
    }
  }

  reset(): void {
    this.draft = clone(PRISTINE);
    this.recompile();
  }

  // ---- lane editing ----

  updateLane(lane: Lane, patch: Partial<{ model: string; cost: number; maxTokens: number }>): void {
    const current = this.draft.lanes[lane];
    this.draft.lanes = {
      ...this.draft.lanes,
      [lane]: {
        ...current,
        ...patch,
        // HOLD has no model on purpose, and must never gain one: its entire
        // job is to not send anything. This page cannot reach it, but the lane
        // is still in the config and must stay honest.
        model: lane === "HOLD" ? null : (patch.model ?? current.model),
      },
    };
    this.recompile();
  }

  setLongRequestChars(value: number): void {
    this.draft.longRequestChars = value;
    this.recompile();
  }

  // ---- the chooser, used when no rule matched ----

  setClassifierModel(model: string): void {
    this.draft.classifierModel = model;
    this.recompile();
  }

  /**
   * The actual text sent to the chooser.
   *
   * Worth being able to edit: it is the one place in the whole router where the
   * decision is made by a model rather than by a rule you can read, and seeing
   * how much the wording changes the answer is the fastest way to understand
   * why the rules run first.
   */
  setClassifierSystem(system: string): void {
    this.draft.classifierSystem = system;
    this.recompile();
  }

  /** True when the classifier prompt is no longer the one from the slides. */
  get classifierEdited(): boolean {
    return this.draft.classifierSystem !== PRISTINE.classifierSystem;
  }

  resetClassifierSystem(): void {
    this.draft.classifierSystem = PRISTINE.classifierSystem;
    this.recompile();
  }
}

export const config = new ConfigStore();
