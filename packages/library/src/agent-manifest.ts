// THE AGENT TIER'S REAL MANIFEST, as a pointer reader every walk can share.
//
// `renderAgentDigest` (`store/render-agent.ts`) assembles an agent's system prompt from the agent
// row's own `context` / `rules` / `antiPatterns` refLists plus its per-step `stepRefs`. It does NOT
// read `dependsOn`. Until this module existed, no dependency walk read those four fields either — so
// an artifact injected into an agent's prompt on EVERY RUN of that agent was simultaneously an
// orphan to `evaluateDepthFromWork`, `evaluateSurfaceDepth`, and every traversal the system offers.
//
// Measured against the live corpus on 2026-08-30: **13 agents inject 116 distinct artifacts** this
// way, and every one of those pointers resolves — 0 name a row the corpus does not hold. Ten of the
// artifacts the surface reading called `unlinked` are in that set, including all five anti-slop
// guardrails and `register-follows-audience`. They are not unlinked in any sense a reader cares
// about; they are reached by the single most reliable delivery path the system has.
//
// ## THE TRAP THIS MODULE EXISTS TO CLOSE: THE SAME FIELDS WEAR TWO SHAPES
//
// The manifest fields sit at the TOP LEVEL of the raw stored row and are NESTED UNDER `fields` on
// the RENDERED wire (`renderStoredDoc`) — and they change shape crossing it. Measured, all three
// readings taken in one run on 2026-08-30:
//
//   • RAW row, top level:      `context: ["asset:signal-and-noise", …]`  → 116 targets
//   • WIRE, top level:         nothing at all                            → **0** targets
//   • WIRE, under `fields`:    `context: "asset:signal-and-noise\nasset:observability-first"`
//     — the refLists render as ONE NEWLINE-JOINED STRING, while `stepRefs` survives as an array of
//     `{step, refs}` objects                                             → 116 targets
//
// So a reader taking the wire's top level returns a confident, plausible **zero**, and one that
// finds `fields` but expects arrays returns a partial count. This module reads a MERGED BAG
// (`{...fields, ...top}`, top winning) and accepts both shapes, which is what lets the studio panel
// (wire) and `probe:depth-from-work` (raw) resolve the SAME 116 edges. `probe:depth-from-work`
// asserts exactly that agreement per row, so the trap is now a probe failure rather than a note.
//
// ## TWO GUARDS, AND BOTH ARE LOAD-BEARING
//
//   • **KIND-GATED to `agent`.** `open-question` rows carry a `context` field too — 26 of them on
//     2026-08-30 — and theirs is PROSE. Splitting that on newlines would manufacture pointers out of
//     English sentences.
//   • **`asset:` PREFIX REQUIRED.** The belt to that brace: even reading a row this module should
//     never have been handed, a line that is not a pointer cannot become one. Every live manifest
//     entry carries the prefix, on both shapes.
//
// TOTAL over untrusted input, for `depthFromWorkNodes`' reason: this runs over the LIVE corpus, so a
// row written by an older schema — or by a branch carrying a field this checkout does not — must
// project as "no manifest" rather than throw. Malformed docs are refused at the WRITE boundary
// (`validateLibraryDoc`); a read-side projection is not where a surprise row takes a surface down.

/**
 * The keys this reader may look up, named rather than left open.
 *
 * `no-known-value-widening`'s sanctioned shape for an accumulator: a narrow interface listing the
 * keys, not `Record<string, unknown>`. It is not ceremony — it is strictly narrower AND turns a
 * typo'd field name into a compile error instead of a silently-empty manifest, which is the exact
 * failure this module exists to end, one level up.
 *
 * Values stay `unknown` on purpose: these arrive from the live store wearing two different shapes
 * (see the header), and claiming a type here would be the widening in the other direction.
 */
interface ManifestBag {
  readonly kind?: unknown;
  readonly category?: unknown;
  readonly context?: unknown;
  readonly rules?: unknown;
  readonly antiPatterns?: unknown;
  readonly stepRefs?: unknown;
}

/** The refList fields `renderAgentDigest` assembles an agent's "Stands on" block from (ADR-0029 §7). */
export const AGENT_MANIFEST_REF_FIELDS: readonly (keyof ManifestBag)[] = [
  "context",
  "rules",
  "antiPatterns",
];

/** The only pointer scheme a manifest entry may wear. See the header's second guard. */
const ASSET_PREFIX = "asset:";

/** The kind whose manifest is read. See the header's first guard. */
const AGENT_KIND = "agent";

/**
 * The raw row's top level merged OVER the wire's `fields` nest, so one reader sees both shapes.
 *
 * Top wins on a collision, matching `kindOfDoc`: the row's own field is the authority when it has
 * one, and the nested copy is what a rendering added.
 */
/**
 * A non-null object, as a NAMED predicate rather than an inline `typeof x !== "object" || x === null`.
 *
 * The name is the point, not the brevity: `check:mutation-diff` reports phantom survivors on inline
 * compound conditions and inline method chains — mutants the tests demonstrably kill when applied by
 * hand under the same runner. Extracting the expression is the recorded remedy for that class
 * (`mutation-rung-misreports-inline-chain-survivors`), and it reads better besides.
 */
function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function manifestBag(doc: unknown): ManifestBag {
  if (!isObject(doc)) return {};
  const top = doc as ManifestBag & { readonly fields?: unknown };
  const nested = top.fields;
  if (!isObject(nested)) return top;
  return { ...(nested as ManifestBag), ...top };
}

/**
 * The artifact id an `asset:` pointer names, or `""` for anything that is not one.
 *
 * Split out of {@link addRef}, and split into statements rather than chained, for the reason
 * {@link isObject} carries.
 */
function idFromPointer(entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed.startsWith(ASSET_PREFIX)) return "";
  const afterScheme = trimmed.slice(ASSET_PREFIX.length);
  return afterScheme.trim();
}

/** One entry, admitted only if it is an `asset:` pointer naming something. */
function addRef(entry: unknown, into: Set<string>): void {
  if (typeof entry !== "string") return;
  const id = idFromPointer(entry);
  if (id !== "") into.add(id);
}

/** A refList in either live shape: an array of pointers (raw) or one newline-joined string (wire). */
function addRefList(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) addRef(entry, into);
    return;
  }
  if (typeof value === "string") {
    for (const line of value.split("\n")) addRef(line, into);
  }
}

/**
 * PURE: every artifact id an AGENT's manifest injects, deduped, in first-seen order.
 *
 * Empty for every non-agent row and for every shape this reader does not recognise — see the header
 * for why that is the honest projection rather than a throw.
 */
export function agentManifestRefs(doc: unknown): string[] {
  const bag = manifestBag(doc);
  // `kind` on the raw row, `category` on the wire — both spellings are live, exactly as `kindOfDoc`
  // reads them. Neither is a reason to widen the gate: an unknown kind is NOT an agent.
  const declared = bag.kind ?? bag.category;
  if (declared !== AGENT_KIND) return [];

  const refs = new Set<string>();
  for (const field of AGENT_MANIFEST_REF_FIELDS) addRefList(bag[field], refs);

  // The per-step doors (ADR-0156 §4 / ADR-0161). These survive rendering as an ARRAY of
  // `{step, refs}` objects on BOTH shapes — the one manifest field the wire does not flatten.
  const steps = bag.stepRefs;
  if (Array.isArray(steps)) {
    for (const step of steps) {
      if (!isObject(step)) continue;
      addRefList((step as { readonly refs?: unknown }).refs, refs);
    }
  }

  return [...refs];
}
