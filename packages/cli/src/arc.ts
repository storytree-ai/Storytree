import type { Store, StoredDoc } from "@storytree/storage-protocol";
import { explainDocValidationError, upcastAndValidate } from "@storytree/library";
import {
  arcIsClosed,
  isForwardLooking,
  loadArcRollup,
  loadArcRollups,
  storyArcStamps,
  type ArcRollup,
} from "@storytree/drive";

// The ADR scaffolder's kebab-caser, reused rather than copied: `arc new` derives an id slug from a
// title exactly as `adr new` derives a filename slug, and a second implementation would be a drift
// seam for no gain. The dependency runs one way only (`adr.ts` knows nothing of arcs).
import { ASSET_REF_PREFIX } from "./asset-citation.js";
import { defaultCliActor } from "./cli-actor.js";
import { kebabSlug } from "./adr.js";
import type { Envelope } from "./envelope.js";

// The arc → children JOIN is not here: it lives in `@storytree/drive`'s `arc-rollup.ts`, which the
// studio server shares (ADR-0267's Consequences: the derived join must stop being CLI-only). This
// module OWNS the rendering — turning that rollup into an ADR-0023 envelope — and the arc write
// verbs. Re-exported so the existing importers (`worktree-create.ts`, the suites) keep their path.
export { arcIsClosed, storyArcStamps };

/**
 * `storytree arc` — the DERIVED initiative view (ADR-0183 D3): an arc reveals its plans, stories,
 * and ADRs by QUERY, never by authored edges on the arc itself. Every containment edge lives on the
 * child — a plan's `arcRef`, an ADR's frontmatter `arc:` stamp, a story's frontmatter `arc:` stamp —
 * so the upward view is derived-from-source (the `adr list` pattern) and can never drift from the
 * children. The arc is ceremony-light by construction: rapid plan churn touches only plan rows.
 *
 *   storytree arc list [--pg]        the ACTIVE arcs: intent + increment count (--all / --closed widen it)
 *   storytree arc show <id> [--pg]   one arc: lifecycle / intent / end state / increments + derived children
 *
 * Arcs are LIVE-canonical (ADR-0023) and plans are live-ONLY (ADR-0183 D2), so the offline seed
 * store shows neither — run with --pg for the real view. The ADR/story stamps are read from disk
 * (offline OK).
 */

export interface ArcViewDeps {
  /** The doc store — the live store under --pg (arcs/plans live only there), the seed offline. */
  store: Store;
  /** `docs/decisions` — scanned for frontmatter `arc:` stamps. Injectable for tests. */
  decisionsDir: string;
  /** `stories/` — each `<id>/story.md` frontmatter scanned for an `arc:` stamp. Injectable. */
  storiesDir: string;
  /** True when the live store is attached (--pg) — used only for honest offline hints. */
  pg: boolean;
}

/** Read a string field off an untyped stored doc body ("" when absent). */
function str(stored: StoredDoc, key: string): string {
  const doc = stored.doc as Record<string, unknown>;
  const v = doc[key];
  return typeof v === "string" ? v : "";
}

/**
 * Which arcs `storytree arc list` renders (ADR-0239 D3). `active` is the DEFAULT and the point of
 * the decision: the list is a worklist, so a finished initiative leaves it and an unclosed one keeps
 * showing up — which is what makes the rot self-correcting (an omission is visible weekly rather
 * than at audit time, the failure that produced ADR-0239).
 */
export type ArcScope = "active" | "closed" | "all";

/** Resolve the scope from the two widening flags — `--all` wins over `--closed`. */
export function arcScopeOf(opts: { all?: boolean | undefined; closed?: boolean | undefined }): ArcScope {
  if (opts.all === true) return "all";
  if (opts.closed === true) return "closed";
  return "active";
}

async function arcList(deps: ArcViewDeps, scope: ArcScope): Promise<Envelope> {
  // The rollup, not a bare `queryDocs({kind:"arc"})`. Since the fold (ADR-0305 D1) an arc's
  // increments are their OWN rows, so counting them means joining — and `loadArcRollups` loads the
  // child sets ONCE for every arc rather than per-arc, which is why the list can afford the join it
  // used to get for free off an array on the doc.
  const rollups = await loadArcRollups(deps);
  if (rollups.length === 0) {
    return {
      ok: true,
      body: deps.pg
        ? "no arcs in the live store yet — an arc is born when a multi-session initiative starts (ADR-0183 D6)."
        : "no arcs here — arcs are LIVE-canonical (and increments live-only), so the offline fixture shows none. Re-run with --pg.",
      // This offer used to point at `library artifact new --file <arc.json>` — the hand-authoring path
      // that WAS the friction (`no-arc-new-scaffolder-verb`): it handed the reader a filename and left
      // them to reverse-engineer the schema. The scaffolder is the honest first move now.
      next: deps.pg
        ? ['storytree arc new --title "<the initiative>" --intent "…" --end-state "…" --pg']
        : ["storytree arc list --pg"],
    };
  }
  const closedCount = rollups.filter((a) => a.lifecycle === "closed").length;
  const shown =
    scope === "all" ? rollups : rollups.filter((a) => (a.lifecycle === "closed") === (scope === "closed"));
  const width = Math.max(1, ...shown.map((a) => a.id.length));
  const rows = shown.map((a) => {
    const landed = a.increments.filter((i) => !isForwardLooking(i.status));
    const open = a.increments.length - landed.length;
    const last = landed[landed.length - 1];
    const lastNote = last
      ? `last ${last.outcome?.date ?? "?"}${last.outcome?.pr !== undefined ? ` ${last.outcome.pr}` : ""}`
      : "no landings yet";
    // The OPEN count rides every row since the fold. Before it, forward-looking work lived in a
    // second array this list never read, so an arc with nine parked remedies and no landings printed
    // "0 increment(s), no landings yet" — indistinguishable from an arc nobody had started.
    const openNote = open > 0 ? `, ${open} open` : "";
    // The state tag rides every closed row so `--all` / `--closed` are never the old blind list;
    // under the default scope no closed arc is shown, so it never appears there.
    const tag = a.lifecycle === "closed" ? "[closed] " : "";
    return `  ${a.id.padEnd(width)}  ${landed.length} landed${openNote}, ${lastNote}  — ${tag}${a.title}`;
  });

  const label = scope === "all" ? "arc(s)" : `${scope} arc(s)`;
  const header = `storytree arc — ${shown.length} ${label}`;
  // The muted footer (D3): the closed arcs are not hidden, they are one flag away.
  const footer =
    scope === "active" && closedCount > 0 ? ["", `  (${closedCount} closed — --all)`] : [];
  const body =
    shown.length === 0
      ? [
          header,
          "",
          scope === "active"
            ? `  (none — all ${closedCount} arc(s) here are closed; --all or --closed to see them)`
            : "  (none — no arc here has been closed yet)",
        ].join("\n")
      : [header, "", ...rows, ...footer].join("\n");

  const pgFlag = deps.pg ? " --pg" : "";
  return {
    ok: true,
    body,
    next: [
      ...shown.slice(0, 3).map((a) => `storytree arc show ${a.id}${pgFlag}`),
      ...(scope === "active" && closedCount > 0 ? [`storytree arc list --all${pgFlag}`] : []),
    ],
  };
}

async function arcShow(deps: ArcViewDeps, id: string | undefined): Promise<Envelope> {
  if (id === undefined) {
    return {
      ok: false,
      body: "arc show needs an id:  storytree arc show <id> --pg",
      next: ["storytree arc list --pg"],
    };
  }
  const stored = await deps.store.getDoc(id);
  if (!stored || stored.kind !== "arc") {
    const arcs = await deps.store.queryDocs({ kind: "arc" });
    return {
      ok: false,
      body: [
        stored
          ? `"${id}" is a ${stored.kind}, not an arc.`
          : `no arc "${id}"${deps.pg ? "" : " in the OFFLINE seed — arcs are live-canonical; try --pg"}.`,
        arcs.length > 0 ? `arcs here: ${arcs.map((d) => d.id).join(", ")}` : "",
      ]
        .filter((s) => s !== "")
        .join("\n"),
      next: ["storytree arc list --pg"],
    };
  }

  // The JOIN is drive's (`deriveArcRollup`) — the studio server reads the SAME value, so the two
  // surfaces cannot disagree about what an arc contains. Everything below is presentation only.
  const rollup = await loadArcRollup(deps, id);
  /* c8 ignore next */
  if (rollup === null) return { ok: false, body: `no arc "${id}".`, next: ["storytree arc list --pg"] };
  return { ok: true, body: renderArcRollup(rollup, deps.pg).join("\n"), next: arcShowNext(rollup, deps.pg) };
}

/**
 * PURE: an {@link ArcRollup} as the `arc show` body. Split out of {@link arcShow} so the rendering
 * is testable without a store, and so the join above it stays I/O-only.
 */
export function renderArcRollup(rollup: ArcRollup, pg: boolean): string[] {
  // `arc show` renders ANY arc regardless of lifecycle (ADR-0239 D3 — only the LIST filters) and
  // states which it is, so a closed initiative is readable without being mistaken for live work.
  const closed = rollup.lifecycle === "closed";
  const lines: string[] = [
    `# ${rollup.title}    [arc]`,
    `id: ${rollup.id}`,
    `lifecycle: ${closed ? "closed — its end state was met; it is out of the default arc list" : "active (in flight)"}`,
    "",
  ];
  if (rollup.intent) lines.push(`**The intent.** ${rollup.intent}`, "");
  if (rollup.endState) lines.push("## End state", "", rollup.endState, "");

  // ONE increment list (ADR-0305 D1), rendered as TWO sections in this order: forward-looking work
  // FIRST, the landing log after. Both halves of that are requirements.
  //
  // FORWARD-LOOKING FIRST, because the old order put it last and that is what broke. `arc show`
  // emitted the increment log before `## Parked work`, so on `verification-integrity-arc` the parked
  // block sat at line 998 of 1069 — behind 34 landings — and a truncated read made a session conclude
  // that two entries it had been directed to read did not exist. Ordering is `deriveArcRollup`'s job
  // (`INCREMENT_STATUS_RANK`), not this renderer's; what happens here is only the split.
  //
  // STILL TWO SECTIONS, because merging them is a different defect and a worse one. ADR-0298 D4 kept
  // unbuilt work out of the landing log STRUCTURALLY, with two arrays that could not be confused. The
  // fold weakens that guarantee to a rendering rule, and ADR-0305 D7 states the obligation outright:
  // no surface may present a `proposal` increment alongside `closed` ones as though it were something
  // that happened. A reader who saw them interleaved would read intentions as history.
  //
  // Each row is ONE line plus its objective and a PULL COMMAND — never its body. That is the other
  // half of what the fold buys: `arc show` on the busiest arc returned 44.6 KB, overflowed the tool
  // result, and took three further passes to read for one paragraph, because an entry was an element
  // of an array inside this document and there was no narrower view. Now there is one, and it is the
  // ordinary artifact read.
  const forward = rollup.increments.filter((i) => isForwardLooking(i.status));
  const landed = rollup.increments.filter((i) => !isForwardLooking(i.status));

  const byStatus = (s: string): number => forward.filter((i) => i.status === s).length;
  lines.push(
    "",
    `## Work  (${byStatus("proposal")} proposal · ${byStatus("ready")} ready · ${byStatus("active")} active)`,
  );
  if (forward.length === 0) {
    lines.push(
      pg
        ? "  (nothing open — every increment on this arc is closed)"
        : "  (none visible OFFLINE — increments are live-only, ADR-0183 D2; try --pg)",
    );
  }
  for (const i of forward) {
    const parked = i.parked === undefined ? "" : `, parked ${i.parked.slice(0, 10)}`;
    const anchor = i.anchorSha === undefined ? "" : `, anchor ${i.anchorSha}`;
    lines.push(`  - ${i.id}  [${i.status}${parked}${anchor}]  — ${i.title}`.trimEnd());
    if (i.objective) lines.push(`      ${i.objective}`);
    // The friction ids are printed because they are what the delivery ceiling joins on (ADR-0298 D3):
    // a reader wondering why an entry went red can follow the edge without querying the store.
    if (i.frictionRefs !== undefined && i.frictionRefs.length > 0) {
      lines.push(`      from friction: ${i.frictionRefs.join(", ")}`);
    }
    lines.push(`      read/edit it:  storytree library artifact ${i.id}${pg ? " --pg" : ""}`);
  }

  // The durable residue: what LANDED (ADR-0183 D1, now the closed increments themselves — ADR-0305 D3
  // keeps them by never pruning the artifact that produced the entry).
  lines.push("", `## Increment log  (${landed.length} closed)`);
  if (landed.length === 0) lines.push("  (no landings yet)");
  for (const i of landed) {
    const o = i.outcome ?? {};
    lines.push(
      `  - ${o.date ?? "?"}${o.pr !== undefined ? `  ${o.pr}` : ""}  ${i.id}  — ${i.title}`.trimEnd(),
    );
    if (i.objective) lines.push(`      ${i.objective}`);
    // `note` is the REASON it closed, and it is printed rather than folded into the objective because
    // ADR-0305 D2 removed `superseded`/`retired` on the understanding that the reason would be
    // written here instead. A closure whose reason is invisible is the state collapse's cost unpaid.
    if (o.note !== undefined && o.note !== "" && o.note !== i.objective) lines.push(`      ${o.note}`);
  }

  // The questions the arc is waiting on (ADR-0267 D4): an `arcRef` on the QUESTION, derived by
  // query here — never an authored question-list on the arc (ADR-0183 D3's containment rule).
  lines.push("", `## Open questions  (derived: open-question.arcRef → ${rollup.id})`);
  if (rollup.questions.length === 0) {
    lines.push(
      pg
        ? "  (none — this arc is not waiting on the owner)"
        : "  (none visible OFFLINE — questions are live-canonical; try --pg)",
    );
  }
  for (const q of rollup.questions) {
    lines.push(`  - ${q.id}  — ${q.title}`);
    // The stakes line is why the question rides here at all (ADR-0267: questions are "part of the
    // payload", so the reader can answer without a re-onboarding round-trip).
    if (q.stakes) lines.push(`      why it matters: ${q.stakes}`);
  }

  lines.push("", `## ADRs  (derived: frontmatter arc: ${rollup.id})`);
  if (rollup.adrs.length === 0) lines.push("  (none)");
  for (const a of rollup.adrs) {
    lines.push(`  - ADR-${String(a.number).padStart(4, "0")}  ${a.status.padEnd(10)} ${a.title}`);
  }

  lines.push("", `## Stories  (derived: story frontmatter arc: ${rollup.id})`);
  if (rollup.stories.length === 0) lines.push("  (none)");
  for (const s of rollup.stories) lines.push(`  - ${s}`);

  return lines;
}

/**
 * The ADR-0023 `next:` offers for one arc — the freshness check for its consumable increments, then
 * the arc artifact itself. `ready` only: a `proposal` has no anchor to check yet and an `active` one
 * is past the point where a freshness verdict would change anything.
 */
function arcShowNext(rollup: ArcRollup, pg: boolean): string[] {
  return [
    ...rollup.increments
      .filter((i) => i.status === "ready")
      .slice(0, 2)
      .map((i) => `storytree increment check ${i.id}${pg ? " --pg" : ""}`),
    `storytree library artifact ${rollup.id}${pg ? " --pg" : ""}`,
  ];
}

// ---------------------------------------------------------------------------
// arc WRITES — the first-class validated edit surface (was: a fragile store one-shot).
//
// An arc is LIVE-canonical (ADR-0023) and load-bearing, so its two authored mutations — narrative
// edits (intent / endState) and the append-at-landing increment log (ADR-0183 D1) — deserve a
// first-class verb that goes through the SAME upcast-and-validate write path as `library artifact
// edit`, not a hand-rolled `getDoc → mutate → upsertDoc` bypass. Named flags mean the author never
// guesses a schema field name, and long/multi-line prose comes from a file (`@path`, resolved by the
// dispatch layer) so shell quoting never mangles it into literal `\n`. `friction`'s reinforce/route
// verbs are the precedent: read the doc, mutate one structured slice, re-validate the WHOLE doc, upsert.
// ---------------------------------------------------------------------------

/** The write context the arc edit verbs need: the live store, the writable flag, an actor + clock. */
export interface ArcWriteDeps {
  /** The doc store — the live store under --pg (arcs live only there). */
  store: Store;
  /** True when the store persists (the live --pg store). A write refuses when false. */
  writable: boolean;
  /** Recorded as the event `actor` on writes; defaults to "cli". */
  actor?: string;
  /** An ISO timestamp (composition-root clock): stamps `updatedAt`; the increment date defaults to its date part. */
  now: string;
  /** True when --pg is attached — used only for the honest offline hint on a miss. */
  pg: boolean;
}

/** Guidance when an arc WRITE is attempted offline — arcs live only in the shared store. */
function arcNotWritable(verb: string): Envelope {
  return {
    ok: false,
    body: `arc ${verb} writes to the shared store — run with --pg (and bring the DB up first: pnpm db:up).`,
    next: ["pnpm db:up", `storytree arc ${verb} <id> --pg`],
  };
}

/**
 * Load an arc doc for a write, or return the honest miss/wrong-kind envelope (the arcShow messaging).
 *
 * `storedKeys` is the key set AS READ FROM THE STORE, captured before any caller mutates the copy.
 * It exists so a validation refusal can charge an unknown field BY AUTHORSHIP: a key the caller
 * added is a typo, a key that was already stored is SCHEMA SKEW — this checkout predates the PR that
 * taught the schema about it (see {@link explainDocValidationError}).
 */
async function loadArcForWrite(
  deps: ArcWriteDeps,
  id: string,
): Promise<{ doc: Record<string, unknown>; storedKeys: readonly string[] } | { error: Envelope }> {
  const stored = await deps.store.getDoc(id);
  if (!stored || stored.kind !== "arc") {
    return {
      error: {
        ok: false,
        body: stored
          ? `"${id}" is a ${stored.kind}, not an arc.`
          : `no arc "${id}"${deps.pg ? "" : " in the OFFLINE seed — arcs are live-canonical; try --pg"}.`,
        next: ["storytree arc list --pg"],
      },
    };
  }
  const doc =
    typeof stored.doc === "object" && stored.doc !== null ? { ...(stored.doc as Record<string, unknown>) } : {};
  return { doc, storedKeys: Object.keys(doc) };
}

/**
 * The `-arc` suffix the live arc ids carry (`end-at-merge-arc`, `session-isolation-arc`,
 * `verification-integrity-arc`, …) — 24 of the 25 in the store as of 2026-07-30, the lone exception
 * being `model-uat-promotion`. {@link arcIdFromTitle} applies it when DERIVING an id, so the
 * scaffolder cannot be the one authoring path that drifts from the house style; an explicit
 * positional id is taken as authored. That measured exception is why this is a DEFAULT with an
 * escape hatch rather than a fence — the convention is strong, not universal.
 */
const ARC_ID_SUFFIX = "-arc";

/**
 * PURE: the arc id `arc new` derives from a `--title` when the author passes no explicit id.
 * Returns "" when the title yields no slug at all (all punctuation) — the caller refuses rather
 * than writing an id-less doc.
 */
export function arcIdFromTitle(title: string): string {
  const slug = kebabSlug(title);
  if (slug === "") return "";
  return slug === "arc" || slug.endsWith(ARC_ID_SUFFIX) ? slug : `${slug}${ARC_ID_SUFFIX}`;
}

/**
 * PURE: the SAME normalisation `kebabSlug` applies, minus its `slice(0, 60)` truncation — so the
 * caller can measure the normalised length BEFORE any cap is silently applied, rather than after.
 *
 * `arc new`'s explicit-id path needs to detect a too-long id and refuse it, not derive a shorter one
 * by dropping characters off the end: `kebabSlug` is right for a DERIVED id (there is no "the author
 * meant" to preserve), but wrong for an AUTHORED one (ADR-0298 D7; `arc-explicit-id-fidelity`) —
 * silently creating the arc under a truncated id would mean a copy-pasted reference to the id the
 * author actually typed resolves to nothing.
 */
function normalizeExplicitId(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The id cap `kebabSlug` enforces by truncation for a derived id; enforced by REFUSAL for an authored one. */
const ARC_ID_CAP = 60;

/** The cap on a DERIVED one-line description before it is cut at a word boundary. */
const DERIVED_DESCRIPTION_CAP = 160;

/**
 * PURE: collapse prose to a single line (the Library card `description` is a one-liner, and a value
 * read from a file via `@path` arrives with newlines and a trailing one).
 */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * PURE: the card one-liner derived from an arc's `intent` when `--description` is omitted.
 *
 * `description` is a required common field, and an arc's `intent` is already "the owner's initiative,
 * in one sentence" (KIND_SPECS) — asking the author for both would re-introduce exactly the
 * redundancy this verb exists to remove. Takes the intent's FIRST sentence, whitespace-collapsed,
 * cut at a word boundary past the cap. An abbreviation ("e.g.") can cut it short; `--description`
 * overrides, so the derivation never has to be right, only reasonable.
 */
export function arcDescriptionFrom(intent: string): string {
  const flat = oneLine(intent);
  const firstSentence = /^(.+?[.!?])(?:\s|$)/.exec(flat)?.[1] ?? flat;
  if (firstSentence.length <= DERIVED_DESCRIPTION_CAP) return firstSentence;
  const cut = firstSentence.slice(0, DERIVED_DESCRIPTION_CAP);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:]+$/, "")}…`;
}

/**
 * `storytree arc new [<id>] --title "..." --intent <text|@file> --end-state <text|@file>
 * [--description <text|@file>] --pg` — SCAFFOLD a new arc through the same validated write path as
 * every other arc verb.
 *
 * The missing FIRST step of an otherwise fully first-class lifecycle: `arc edit` / `arc increment
 * add` (ADR-0183 D1) and `arc close` (ADR-0239 D2) all exist, but CREATING an arc still meant
 * reading `KIND_SPECS` to learn the field set, hand-writing the whole doc JSON with
 * `createdAt`/`updatedAt` hand-stamped, and filing it through `library artifact new --file`
 * (friction `no-arc-new-scaffolder-verb`, routed `tool`).
 *
 * It follows the `adr new` precedent (ADR-0050) — take the substance, stamp the mechanical fields,
 * validate, hand back — with the one difference that friction's own adjudication names: an arc id is
 * a SLUG, so there is no number to reserve atomically and no DB allocator here. This verb is the
 * CHEAPER of the two, not the dearer.
 *
 * The author supplies the three required fields only. The CLI owns `kind`; `id` (derived from the
 * title unless one is passed); `description` (derived from the intent unless passed); `references`;
 * `schemaVersion` (via the upcaster); both timestamps; and `lifecycle: active` — the schema default,
 * spelled out so a born arc is explicitly in flight rather than defaulted-into-it. `increments` is
 * deliberately ABSENT: an arc is born with an empty landing log, and the first entry arrives through
 * `arc increment add` (ADR-0183 D1 — the log is append-only residue, never authored ahead of a
 * landing). Nothing here authors a containment edge either: plans/ADRs/stories point UP at the arc
 * (D3), so there is no child list to seed.
 */
export async function arcNew(
  deps: ArcWriteDeps,
  id: string | undefined,
  opts: {
    title?: string | undefined;
    intent?: string | undefined;
    endState?: string | undefined;
    description?: string | undefined;
  },
): Promise<Envelope> {
  if (!deps.writable) return arcNotWritable("new");

  const usage =
    'storytree arc new [<id>] --title "..." --intent <text|@file> --end-state <text|@file> --pg';
  const title = opts.title?.trim() ?? "";
  const intent = opts.intent?.trim() ?? "";
  const endState = opts.endState?.trim() ?? "";

  // One refusal naming EVERYTHING missing — three round-trips to learn three required fields is the
  // schema-spelunking cost in a different costume.
  const missing = [
    title === "" ? '--title "<short name for the initiative>"' : null,
    intent === "" ? "--intent <the owner's initiative, in one sentence>" : null,
    endState === "" ? "--end-state <the observable condition under which this arc is delivered>" : null,
  ].filter((s): s is string => s !== null);
  if (missing.length > 0) {
    return {
      ok: false,
      body: [
        `arc new needs ${missing.length === 1 ? "one more field" : `${missing.length} more fields`}:`,
        ...missing.map((m) => `  ${m}`),
        "",
        "An arc is a named multi-story intent tracked to a closed end-state (ADR-0183 D1). Long prose:",
        "@path reads the value from a file, so newlines survive the shell.",
      ].join("\n"),
      next: [usage, "storytree arc list --pg   (search before you write)"],
    };
  }

  // An explicit positional id is taken as AUTHORED (normalised only, so a copy-pasted `asset:` ref or
  // stray capitals can't mint an id the ref regexes then reject); otherwise derive it from the title.
  const wanted = id?.trim().replace(/^asset:/, "") ?? "";

  // Refuse a lossy explicit id BEFORE any store read or write (`arc-explicit-id-refuses-lossy-cap`):
  // normalise first, and if the result alone exceeds the cap, stop — never let `kebabSlug` truncate
  // an authored id into a different one the author never typed.
  if (wanted !== "") {
    const normalized = normalizeExplicitId(wanted);
    if (normalized.length > ARC_ID_CAP) {
      return {
        ok: false,
        body: `the explicit id "${wanted}" normalises to ${normalized.length} characters, past the ${ARC_ID_CAP}-character id cap — creating it would silently truncate to a DIFFERENT id than the one you typed. Shorten it and try again.`,
        next: [usage],
      };
    }
  }

  const arcId = wanted !== "" ? kebabSlug(wanted) : arcIdFromTitle(title);
  if (arcId === "") {
    return {
      ok: false,
      body: `could not derive an arc id from ${wanted !== "" ? `"${wanted}"` : `the title "${title}"`} — use letters/numbers, or pass an explicit id: storytree arc new <id> --title "..." --pg`,
      next: [usage],
    };
  }

  // Creation is the one arc verb that must refuse an id that EXISTS — `library artifact new`'s
  // edit-first guard, kept here so a scaffolder can never silently overwrite a live initiative.
  const clash = await deps.store.getDoc(arcId);
  if (clash) {
    return {
      ok: false,
      body:
        clash.kind === "arc"
          ? [
              `arc ${arcId} already exists — edit it, don't recreate it (a scaffold here would overwrite a live initiative).`,
              wanted === "" ? `(that id was DERIVED from the title "${title}" — pass an explicit id to create a different arc.)` : "",
            ]
              .filter((s) => s !== "")
              .join("\n")
          : `"${arcId}" is already a ${clash.kind}, not an arc — ids are shared across kinds, so pick another: storytree arc new <id> --title "..." --pg`,
      next: clash.kind === "arc" ? [`storytree arc show ${arcId} --pg`, `storytree arc edit ${arcId} --intent <text|@file> --pg`] : [usage],
    };
  }

  const derivedDescription = opts.description === undefined;
  const description = derivedDescription ? arcDescriptionFrom(intent) : oneLine(opts.description ?? "");
  const doc: Record<string, unknown> = {
    kind: "arc",
    id: arcId,
    title,
    description,
    intent,
    endState,
    lifecycle: "active",
    references: [],
    createdAt: deps.now,
    updatedAt: deps.now,
  };

  let valid: unknown;
  try {
    valid = upcastAndValidate(doc);
  } catch (e) {
    return {
      ok: false,
      body: `that would not be a valid arc:\n${(e as Error).message}`,
      next: [usage],
    };
  }
  const saved = await deps.store.upsertDoc({ id: arcId, kind: "arc", doc: valid, actor: deps.actor ?? defaultCliActor() });

  return {
    ok: true,
    body: [
      `created arc ${saved.id}  [active, 0 increments]`,
      "",
      `# ${title}`,
      `**The intent.** ${intent}`,
      "",
      "## End state",
      endState,
      ...(wanted === "" || derivedDescription
        ? [
            "",
            ...(wanted === "" ? [`id derived from the title: ${saved.id}   (pass an explicit id to override)`] : []),
            ...(derivedDescription ? [`description derived from the intent: ${description}`] : []),
          ]
        : []),
      "",
      // The ADR-0183 D3 reminder, delivered where it is actionable rather than in any agent prompt:
      // the arc holds no child list, so the very next writes are the CHILDREN's upward stamps.
      "Every containment edge lives on the CHILD, so nothing else is authored here — stamp the arc on",
      "each child as it is created and this arc's view assembles itself by query.",
    ].join("\n"),
    next: [
      `storytree arc show ${saved.id} --pg`,
      `storytree adr new --title "..." --arc ${saved.id} --pg   (an ADR produced under this arc)`,
      `storytree arc increment add ${saved.id} --outcome "<what landed>" --pr <ref> --pg   (at each landing)`,
    ],
  };
}

/**
 * `storytree arc edit <id> [--intent <text|@file>] [--end-state <text|@file>] --pg` — patch an arc's
 * narrative fields through the validated write path. At least one of intent / end state is required;
 * the value(s) arrive already `@path`-resolved (the dispatch layer reads the file so long prose is
 * never mangled by shell quoting). Re-validates the WHOLE arc (a bad edit returns the message, never
 * persists), then upserts (one event + projection update). The id must already exist.
 */
export async function arcEdit(
  deps: ArcWriteDeps,
  id: string | undefined,
  opts: { intent?: string | undefined; endState?: string | undefined },
): Promise<Envelope> {
  if (!deps.writable) return arcNotWritable("edit");
  if (id === undefined) {
    return {
      ok: false,
      body: "arc edit needs an id: storytree arc edit <id> --intent <text|@file> | --end-state <text|@file> --pg",
      next: ["storytree arc list --pg"],
    };
  }
  if (opts.intent === undefined && opts.endState === undefined) {
    return {
      ok: false,
      body: "nothing to change — pass --intent <text|@file> and/or --end-state <text|@file> (long prose: @path reads from a file).",
      next: [`storytree arc show ${id} --pg`],
    };
  }
  const found = await loadArcForWrite(deps, id);
  if ("error" in found) return found.error;

  const base = found.doc;
  if (opts.intent !== undefined) base["intent"] = opts.intent;
  if (opts.endState !== undefined) base["endState"] = opts.endState;
  base["updatedAt"] = deps.now;

  let valid: unknown;
  try {
    valid = upcastAndValidate(base);
  } catch (e) {
    return {
      ok: false,
      body: `edit would make "${id}" invalid:\n${explainDocValidationError(base, e, { storedKeys: found.storedKeys })}`,
      next: [`storytree arc show ${id} --pg`],
    };
  }
  const saved = await deps.store.upsertDoc({ id, kind: "arc", doc: valid, actor: deps.actor ?? defaultCliActor() });
  const changed = [opts.intent !== undefined ? "intent" : null, opts.endState !== undefined ? "endState" : null]
    .filter((s): s is string => s !== null)
    .join(", ");
  return { ok: true, body: `updated arc ${saved.id} (${changed}).`, next: [`storytree arc show ${saved.id} --pg`] };
}

// ---------------------------------------------------------------------------
// The INCREMENT verbs (ADR-0305 D1).
//
// Three verbs replace four, and the collapse is the decision. `arc increment add` (the landing log),
// `arc proposal add` (park deferred work) and `arc proposal realize` (discharge it) all mutated an
// ARRAY on the arc doc; an increment is its own row now, so they write documents instead. The fourth
// operation they never had — CORRECTING an entry — needs no verb at all: `library artifact edit
// <increment-id> --pg` is it, which is why a duplicate parked minutes earlier by a concurrent session
// stops being permanent.
// ---------------------------------------------------------------------------

/** PURE: the first sentence of some prose, whitespace-collapsed — the derived `objective` / `title`. */
function firstSentenceOf(text: string, cap: number): string {
  const flat = oneLine(text);
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(flat)?.[1] ?? flat;
  if (sentence.length <= cap) return sentence;
  const cut = sentence.slice(0, cap);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:]+$/, "")}…`;
}

/** The cap on a DERIVED increment title before it is cut at a word boundary. */
const DERIVED_TITLE_CAP = 80;

/**
 * Validate and upsert one increment doc, reporting a refusal against the doc the caller MEANT.
 *
 * Shared by all three verbs so the conditional invariants (`assertIncrementInvariants`) are enforced
 * on one path — a verb that assembled its own `upsertDoc` call could write a `proposal` with no
 * `parked` stamp and quietly un-measure it from the delivery ceiling.
 */
async function upsertIncrement(
  deps: ArcWriteDeps,
  doc: Record<string, unknown>,
  what: string,
  arcId: string,
): Promise<Envelope | { saved: { id: string } }> {
  let valid: unknown;
  try {
    valid = upcastAndValidate(doc);
  } catch (e) {
    return {
      ok: false,
      body: `${what} would be invalid:\n${explainDocValidationError(doc, e)}`,
      next: [`storytree arc show ${arcId} --pg`],
    };
  }
  const saved = await deps.store.upsertDoc({
    id: doc["id"] as string,
    kind: "increment",
    doc: valid,
    actor: deps.actor ?? defaultCliActor(),
  });
  return { saved };
}

/** Refuse an id already taken — an increment id is GLOBAL now, not merely arc-unique. */
async function refuseTakenId(deps: ArcWriteDeps, id: string): Promise<Envelope | null> {
  const existing = await deps.store.getDoc(id);
  if (existing === null || existing === undefined) return null;
  return {
    ok: false,
    body:
      `"${id}" already exists as a ${existing.kind}. An increment is its own row, so its id is unique ` +
      "across the whole store rather than only within one arc — pick another, or edit the existing " +
      "one in place.",
    next: [`storytree library artifact ${id} --pg`, `storytree library artifact edit ${id} --pg`],
  };
}

/**
 * `storytree arc increment add <arc-id> --outcome <text|@file> [--pr <ref>] [--date <YYYY-MM-DD>]
 * [--id <slug>] --pg` — record one LANDING on the arc: the merge ceremony's residue step (ADR-0271).
 *
 * Before the fold this appended a row to `arc.increments[]`. It now CREATES a closed increment doc,
 * which is ADR-0305's named ergonomic cost stated plainly: "work that landed with no increment
 * authored has nowhere to record itself, and the closing leg must create one rather than assume it."
 * It is still ONE command, and the fields it does not ask for are derived — `objective` and `title`
 * from the outcome's first sentence, `id` from the arc plus the next free ordinal — so the ceremony
 * costs the session exactly what it did before.
 *
 * Work that was PARKED first should close its existing increment (`arc increment close`) rather than
 * mint a second one here; that is what keeps a deferred intention traceable to the landing that
 * discharged it instead of leaving two rows describing one piece of work.
 */
export async function arcIncrementAdd(
  deps: ArcWriteDeps,
  arcId: string | undefined,
  opts: { date?: string | undefined; pr?: string | undefined; outcome?: string | undefined; id?: string | undefined },
): Promise<Envelope> {
  if (!deps.writable) return arcNotWritable("increment add");
  if (arcId === undefined) {
    return {
      ok: false,
      body: "arc increment add needs an arc id:  storytree arc increment add <arc-id> --outcome <text|@file> --pg",
      next: ["storytree arc list --pg"],
    };
  }
  const outcomeText = opts.outcome?.trim();
  if (outcomeText === undefined || outcomeText === "") {
    return {
      ok: false,
      body: "arc increment add needs --outcome — what landed / halted / was re-planned (long prose: --outcome @path reads from a file).",
      next: [`storytree arc show ${arcId} --pg`],
    };
  }
  const found = await loadArcForWrite(deps, arcId);
  if ("error" in found) return found.error;

  const date = opts.date?.trim() !== undefined && opts.date.trim() !== "" ? opts.date.trim() : deps.now.slice(0, 10);
  const pr = opts.pr?.trim();

  // The id: an explicit `--id`, else `<arc>-inc-NN` at the next free ordinal. The scan skips ids
  // already taken, so a re-run mints a fresh row rather than silently overwriting a landing.
  let id = opts.id?.trim();
  if (id === undefined || id === "") {
    const siblings = (await deps.store.queryDocs({ kind: "increment" })).filter((d) => {
      const bag = d.doc as Record<string, unknown>;
      return bag["arcRef"] === `asset:${arcId}`;
    });
    let n = siblings.length + 1;
    while (await deps.store.getDoc(`${arcId}-inc-${String(n).padStart(2, "0")}`)) n += 1;
    id = `${arcId}-inc-${String(n).padStart(2, "0")}`;
  }
  const taken = await refuseTakenId(deps, id);
  if (taken !== null) return taken;

  const lead = firstSentenceOf(outcomeText, DERIVED_TITLE_CAP);
  const doc: Record<string, unknown> = {
    kind: "increment",
    id,
    title: lead,
    description: arcDescriptionFrom(outcomeText),
    objective: lead,
    body: outcomeText,
    arcRef: `asset:${arcId}`,
    status: "closed",
    // A landing whose PR ref is absent still owes a reason (`assertIncrementInvariants`), and the
    // outcome prose IS that reason — an owner attestation, an honest halt.
    outcome: { date, ...(pr !== undefined && pr !== "" ? { pr } : { note: outcomeText }) },
    references: [],
    createdAt: deps.now,
    updatedAt: deps.now,
  };
  const result = await upsertIncrement(deps, doc, `increment "${id}"`, arcId);
  if ("ok" in result) return result;

  // The closure reminder lives HERE, in the output of the command the situation forces you to run,
  // not in any agent prompt (ADR-0239 D4 — the ADR-0023 pull model applied to a ceremony step). The
  // session that just recorded a landing reads the closure question at the exact moment it can answer
  // it, against the arc's OWN stored end state. It never asserts the end state was met; the "(if …)"
  // is load-bearing, since that call is irreducibly the session's.
  const endState = typeof found.doc["endState"] === "string" ? found.doc["endState"] : "";
  const alreadyClosed = found.doc["lifecycle"] === "closed";
  const closureHint = !alreadyClosed && endState !== "" ? `\n\nthis arc's end state: ${endState}` : "";

  return {
    ok: true,
    body:
      `recorded increment ${result.saved.id} on arc ${arcId} — ${date}${pr !== undefined && pr !== "" ? `  ${pr}` : ""}\n` +
      `${lead}` +
      closureHint,
    next: [
      `storytree arc show ${arcId} --pg`,
      `storytree library artifact ${result.saved.id} --pg`,
      ...(alreadyClosed
        ? []
        : [`storytree arc close ${arcId} --outcome "…" --pg  (if this landing met the end state)`]),
    ],
  };
}

/** The body an increment carries at birth. */
export interface ArcIncrementBodyOpts {
  objective?: string | undefined;
  body?: string | undefined;
}

/**
 * `storytree arc increment new <arc-id> --id <slug> --title "…" --objective <text|@file>
 * --body <text|@file> [--friction <id>]... --pg` — PARK one unit of decided-but-unbuilt work on the
 * arc that owns it (ADR-0298 D1, on the increment tier since ADR-0305 D1).
 *
 * The successor to `arc proposal add`, and the difference ADR-0298 built is preserved exactly: there
 * is no way to park work without naming an arc, so a remedy can never arrive detached from the
 * initiative that carries it. Charter one first (`arc new`) when none fits — that stays first-class
 * and free; what is refused is a HOMELESS item, not a new arc.
 *
 * Two things the array-based predecessor could not do now come for free, and they are the reason the
 * fold was worth building: the entry is READABLE on its own (`library artifact <id> --pg`, which
 * prints the whole body rather than the five fields `arc show` happened to render), and it is
 * CORRECTABLE (`library artifact edit <id> --pg`), so a duplicate parked minutes earlier by a
 * concurrent session is no longer permanent.
 *
 * `parked` is stamped from the composition-root clock and is never caller-supplied: it is the
 * delivery ceiling's comparison point (ADR-0298 D3), so a caller able to backdate it could silence
 * the very recurrences that select an entry.
 */
export async function arcIncrementNew(
  deps: ArcWriteDeps,
  arcId: string | undefined,
  opts: ArcIncrementBodyOpts & { id?: string | undefined; title?: string | undefined; friction?: string[] | undefined },
): Promise<Envelope> {
  if (!deps.writable) return arcNotWritable("increment new");
  if (arcId === undefined) {
    return {
      ok: false,
      body: 'arc increment new needs an arc id: storytree arc increment new <arc-id> --id <slug> --title "…" --objective <text|@file> --body <text|@file> --pg',
      next: ["storytree arc list --pg", 'storytree arc new --title "…" --intent @file --end-state @file --pg'],
    };
  }
  const id = opts.id?.trim();
  const title = opts.title?.trim();
  const objective = opts.objective?.trim();
  const body = opts.body?.trim();
  const missing = [
    id === undefined || id === "" ? "--id <slug>" : "",
    title === undefined || title === "" ? '--title "…"' : "",
    objective === undefined || objective === "" ? "--objective <text|@file>" : "",
    body === undefined || body === "" ? "--body <text|@file>" : "",
  ].filter((s) => s !== "");
  if (missing.length > 0 || id === undefined || title === undefined || objective === undefined || body === undefined) {
    return {
      ok: false,
      body:
        `arc increment new needs ${missing.join(", ")}.\n` +
        "`--body` is required for the same reason `friction new` demands evidence: a parked entry with no stated cost of NOT doing it is the thin filing this tier exists to prevent. Say what prompts it, the blast radius, the ordered steps, and the risks — the schema no longer has a heading per question (ADR-0305 D4), so the body is where they go (long prose: --field @path reads from a file).",
      next: [`storytree arc show ${arcId} --pg`],
    };
  }

  const found = await loadArcForWrite(deps, arcId);
  if ("error" in found) return found.error;
  const taken = await refuseTakenId(deps, id);
  if (taken !== null) return taken;

  const frictionRefs = (opts.friction ?? []).map((f) => f.trim()).filter((f) => f !== "");
  const doc: Record<string, unknown> = {
    kind: "increment",
    id,
    title,
    description: arcDescriptionFrom(objective),
    objective,
    body,
    arcRef: `asset:${arcId}`,
    status: "proposal",
    parked: deps.now,
    ...(frictionRefs.length > 0 ? { frictionRefs } : {}),
    references: [],
    createdAt: deps.now,
    updatedAt: deps.now,
  };
  const result = await upsertIncrement(deps, doc, `parking "${id}" on arc ${arcId}`, arcId);
  if ("ok" in result) return result;

  // The obligation this write opens, stated where it is incurred rather than left to memory (the
  // ADR-0239 D4 precedent). An entry with no `--friction` is unreachable by the recurrence ceiling
  // and quiet forever — legitimate for work nobody filed friction about, and a silent gap otherwise,
  // so it is named rather than hidden (ADR-0095: no silent caps).
  const uncited =
    frictionRefs.length === 0
      ? "\n\nNOTE: no --friction given, so the delivery ceiling can never red this entry (it has no source to be reinforced). That is correct for work no friction item filed, and a gap otherwise."
      : "";

  return {
    ok: true,
    body: `parked increment ${result.saved.id} on arc ${arcId} — ${title}` + uncited,
    next: [
      `storytree arc show ${arcId} --pg`,
      `storytree library artifact edit ${result.saved.id} --pg   (correct it in place)`,
      ...(frictionRefs.length > 0
        ? [`storytree friction route ${frictionRefs[0]} --route tool --reason @<file> --arc ${arcId} --pg`]
        : []),
      `storytree arc increment close ${result.saved.id} --pr <ref> --pg   (when it lands)`,
    ],
  };
}

/** What {@link dropDischargedCitations} did, per friction item — reported, never silent. */
interface CitationOutcome {
  /** Frictions whose `asset:<arc>` citation was removed. */
  readonly dropped: readonly string[];
  /** Frictions kept, each with the still-open entry that holds the citation up. */
  readonly kept: readonly { readonly friction: string; readonly by: string }[];
  /** Frictions the drop could not be written for, with the reason and the hand remedy. */
  readonly failed: readonly { readonly friction: string; readonly why: string }[];
}

/**
 * THE `tool`-ROUTE LIFECYCLE'S REVERSE GEAR (parked entry
 * `realizing-an-entry-drops-the-friction-edge-cli-write-fidelity`).
 *
 * `friction route --route tool --arc <id>` APPENDS an `asset:<arc-id>` citation to the friction's
 * `references[]` — the outbound pointer saying "the remedy for this is parked over there". Nothing
 * ever removed it. `friction route` treats its reference list as append-only and has no removal
 * path, so the only way to drop a discharged citation was `library artifact edit --set references=…`
 * — re-writing another adjudicator's row by hand, in a fixed, undocumented order that two lanes
 * independently re-derived from source hours apart on 2026-08-03.
 *
 * So the closing verb does it, in the same command that discharges the entry.
 *
 * ONLY WHEN NOTHING ELSE HOLDS IT UP. An arc may carry more than one open entry naming the same
 * friction; dropping the citation while another is still parked would erase a live pointer. So the
 * other OPEN entries on this arc are consulted first, and a citation held up by one is KEPT and the
 * holder named.
 *
 * THE TRACE IS NOT LOST, which is why dropping is safe rather than merely tidy: the closed increment
 * keeps its own `frictionRefs`, and a closed increment is permanent (ADR-0305 D3 — closed, never
 * deleted). The edge survives in the direction that carries the delivery signal (entry → friction);
 * what goes is the friction's forward pointer at an arc that has finished with it.
 *
 * NEVER FAIL-CLOSED ON THE CLOSE. The increment is already closed when this runs, and `close` refuses
 * a second run — so a friction whose write fails is REPORTED with its hand remedy rather than
 * throwing away the landing that just succeeded.
 */
async function dropDischargedCitations(
  deps: ArcWriteDeps,
  closingId: string,
  arcId: string,
  frictionRefs: readonly string[],
): Promise<CitationOutcome> {
  const dropped: string[] = [];
  const kept: { friction: string; by: string }[] = [];
  const failed: { friction: string; why: string }[] = [];
  if (frictionRefs.length === 0) return { dropped, kept, failed };

  const citation = `${ASSET_REF_PREFIX}${arcId}`;
  const increments = await deps.store.queryDocs({ kind: "increment" });
  const stillOpen = increments.filter((d) => {
    const doc = typeof d.doc === "object" && d.doc !== null ? (d.doc as Record<string, unknown>) : {};
    return d.id !== closingId && doc["arcRef"] === citation && doc["status"] !== "closed";
  });

  for (const frictionId of frictionRefs) {
    const holder = stillOpen.find((d) => {
      const refs = (d.doc as Record<string, unknown>)["frictionRefs"];
      return Array.isArray(refs) && refs.includes(frictionId);
    });
    if (holder !== undefined) {
      kept.push({ friction: frictionId, by: holder.id });
      continue;
    }
    try {
      const stored = await deps.store.getDoc(frictionId);
      if (!stored || stored.kind !== "friction") continue;
      const base =
        typeof stored.doc === "object" && stored.doc !== null
          ? { ...(stored.doc as Record<string, unknown>) }
          : {};
      const refs = Array.isArray(base["references"]) ? (base["references"] as unknown[]) : [];
      const next = refs.filter((r) => !(typeof r === "string" && r.trim() === citation));
      if (next.length === refs.length) continue; // no citation to drop
      base["references"] = next;
      base["updatedAt"] = deps.now;
      const valid = upcastAndValidate(base);
      await deps.store.upsertDoc({
        id: frictionId,
        kind: "friction",
        doc: valid,
        actor: deps.actor ?? defaultCliActor(),
      });
      dropped.push(frictionId);
    } catch (e) {
      failed.push({ friction: frictionId, why: e instanceof Error ? e.message : String(e) });
    }
  }
  return { dropped, kept, failed };
}

/** The citation outcome as envelope lines — empty when the entry cited no friction. */
function citationLines(outcome: CitationOutcome, arcId: string): string[] {
  const lines: string[] = [];
  if (outcome.dropped.length > 0) {
    lines.push(
      `dropped the asset:${arcId} citation from ${outcome.dropped.join(", ")} — the arc has finished ` +
        "with it, and the closed entry's own frictionRefs keeps the trace.",
    );
  }
  for (const k of outcome.kept) {
    lines.push(`kept ${k.friction}'s asset:${arcId} citation — entry ${k.by} is still open and names it.`);
  }
  for (const f of outcome.failed) {
    lines.push(
      `COULD NOT drop ${f.friction}'s asset:${arcId} citation: ${f.why}`,
      `  fix by hand:  storytree library artifact edit ${f.friction} --set references=@refs.json --pg`,
    );
  }
  return lines;
}

/**
 * `storytree arc increment close <id> [--pr <ref>] [--date <YYYY-MM-DD>] [--note <text|@file>] --pg`
 * — mark one increment TERMINAL (ADR-0305 D2/D5), for any reason.
 *
 * The successor to `arc proposal realize`, and it is deliberately wider. `realize` meant LANDED and
 * nothing else, so an entry that turned out to be wrong, duplicated, or discharged by a deletion
 * elsewhere had no honest exit: marking it realized would have been a false landing on the very tier
 * that exists to prevent those, and there was no other verb. `close` covers both, and the difference
 * is written down rather than implied — which is exactly why **`--note` is REQUIRED when there is no
 * `--pr`.** ADR-0305 D2 removed `superseded` and `retired` as separate states on the grounds that the
 * difference between them was a REASON, not a state; that trade only holds if the reason is recorded.
 *
 * Closing is cheap because it rides a step the closing leg already performs (ADR-0271). The
 * increment is CLOSED, never deleted — its own history is the trace, and a closed increment IS the
 * arc's landing-log entry (D3).
 */
export async function arcIncrementClose(
  deps: ArcWriteDeps,
  id: string | undefined,
  opts: { pr?: string | undefined; date?: string | undefined; note?: string | undefined },
): Promise<Envelope> {
  if (!deps.writable) return arcNotWritable("increment close");
  if (id === undefined || id.trim() === "") {
    return {
      ok: false,
      body: "arc increment close needs an increment id: storytree arc increment close <id> --pr <ref> --pg",
      next: ["storytree arc list --pg"],
    };
  }
  const stored = await deps.store.getDoc(id);
  if (!stored || stored.kind !== "increment") {
    return {
      ok: false,
      body: stored
        ? `"${id}" is a ${stored.kind}, not an increment.`
        : `no increment "${id}"${deps.pg ? "" : " in the OFFLINE fixture — increments are live-ONLY (ADR-0183 D2); run with --pg"}.`,
      next: ["storytree arc list --pg"],
    };
  }
  const doc =
    typeof stored.doc === "object" && stored.doc !== null ? { ...(stored.doc as Record<string, unknown>) } : {};
  const arcRef = typeof doc["arcRef"] === "string" ? (doc["arcRef"] as string).replace(/^asset:/, "") : "?";

  if (doc["status"] === "closed") {
    return {
      ok: false,
      body: `increment "${id}" is already closed — closure is recorded once, like a landing.`,
      next: [`storytree arc show ${arcRef} --pg`, `storytree library artifact ${id} --pg`],
    };
  }

  const date = opts.date?.trim() !== undefined && opts.date.trim() !== "" ? opts.date.trim() : deps.now.slice(0, 10);
  const pr = opts.pr?.trim();
  const note = opts.note?.trim();
  if ((pr === undefined || pr === "") && (note === undefined || note === "")) {
    return {
      ok: false,
      body: [
        "arc increment close needs --pr <ref> or --note <text|@file>.",
        "ADR-0305 D2 removed `superseded` and `retired` as states because the difference between them",
        "was a REASON, not a state — so the reason has to be written somewhere. Give the landing ref,",
        "or say why it closed: discharged by a deletion, duplicated by a sibling, decided against.",
        "An unexplained closure reads as a landing that never happened (long prose: --note @path).",
      ].join("\n"),
      next: [`storytree library artifact ${id} --pg`],
    };
  }

  doc["status"] = "closed";
  doc["outcome"] = {
    date,
    ...(pr !== undefined && pr !== "" ? { pr } : {}),
    ...(note !== undefined && note !== "" ? { note } : {}),
  };
  doc["updatedAt"] = deps.now;

  const result = await upsertIncrement(deps, doc, `closing increment "${id}"`, arcRef);
  if ("ok" in result) return result;

  // The reverse gear, in the SAME verb (see {@link dropDischargedCitations}) — after the close, so a
  // refused close never strips a citation off a still-parked entry.
  const frictionRefs = Array.isArray(doc["frictionRefs"])
    ? (doc["frictionRefs"] as unknown[]).filter((f): f is string => typeof f === "string")
    : [];
  const citations = await dropDischargedCitations(deps, id, arcRef, frictionRefs);

  return {
    ok: true,
    body: [
      `closed increment ${result.saved.id} on arc ${arcRef} — ${date}${pr !== undefined && pr !== "" ? `  ${pr}` : ""}` +
        (note !== undefined && note !== "" ? `\n${note}` : ""),
      ...citationLines(citations, arcRef),
    ].join("\n"),
    next: [`storytree arc show ${arcRef} --pg`, `storytree library artifact ${result.saved.id} --pg`],
  };
}

/**
 * `storytree arc close <id> --outcome <text|@file> [--pr <ref>] [--date <YYYY-MM-DD>] --pg` — the
 * ONE closing verb (ADR-0239 D2): it records the terminal increment AND sets `lifecycle: closed`, so
 * the state and the prose that justifies it are written together.
 *
 * `--outcome` is REQUIRED and that is the whole design: an arc cannot go closed without a terminal
 * increment stating the observable `endState` condition it met. This is the ADR-0084/0086 discipline
 * applied unchanged — a status is a projection of prose that supports it, never a free flip — which
 * is also why `library artifact edit --set lifecycle=closed` is refused at the generic edit surface.
 *
 * ADR-0239 D2's "SINGLE atomic write" DOES NOT SURVIVE THE FOLD, and that is stated here rather than
 * quietly dropped. The terminal increment is its own row now (ADR-0305 D1), so closing an arc writes
 * two documents and no transaction spans them. The ORDER is the mitigation: the increment lands
 * first, so an interrupted close leaves an increment recorded against an arc that is still open —
 * visibly unfinished, and fixed by re-running this verb — rather than a `closed` arc with no prose
 * behind it, which is precisely the lie the atomicity was written to prevent. The invariant that
 * mattered is preserved; the mechanism that delivered it could not be.
 *
 * Re-opening (`closed → active`) is deliberately NOT a verb here: it is owner-only, mirroring
 * ADR-0084's human-only `accepted → proposed` un-deciding. An agent may recognise that an end state
 * was met; deciding it was NOT is the owner's call.
 */
export async function arcClose(
  deps: ArcWriteDeps,
  id: string | undefined,
  opts: { date?: string | undefined; pr?: string | undefined; outcome?: string | undefined },
): Promise<Envelope> {
  if (!deps.writable) return arcNotWritable("close");
  if (id === undefined) {
    return {
      ok: false,
      body: "arc close needs an id: storytree arc close <id> --outcome <text|@file> [--pr <ref>] --pg",
      next: ["storytree arc list --pg"],
    };
  }
  const outcome = opts.outcome?.trim();
  if (outcome === undefined || outcome === "") {
    return {
      ok: false,
      body: [
        "arc close needs --outcome — the terminal increment stating the observable end-state condition this arc met.",
        "An arc never goes closed without it: the state is a projection of the prose that supports it (ADR-0239 D2 / ADR-0084).",
        "(long prose: --outcome @path reads from a file).",
      ].join("\n"),
      next: [`storytree arc show ${id} --pg`],
    };
  }
  const found = await loadArcForWrite(deps, id);
  if ("error" in found) return found.error;

  const base = found.doc;
  if (base["lifecycle"] === "closed") {
    return {
      ok: false,
      body: [
        `arc ${id} is already closed — nothing to do (this verb is not an increment append).`,
        "Re-opening a closed arc is OWNER-only (ADR-0239 D2, mirroring ADR-0084's human-only un-deciding):",
        "if its end state was NOT met, escalate that call rather than flipping it back.",
      ].join("\n"),
      next: [`storytree arc show ${id} --pg`],
    };
  }

  // 1. The terminal increment FIRST — see the header for why this order is the mitigation.
  const terminal = await arcIncrementAdd(deps, id, {
    outcome,
    ...(opts.pr !== undefined ? { pr: opts.pr } : {}),
    ...(opts.date !== undefined ? { date: opts.date } : {}),
  });
  if (!terminal.ok) return terminal;

  // 2. Then the flip.
  base["lifecycle"] = "closed";
  base["updatedAt"] = deps.now;
  let valid: unknown;
  try {
    valid = upcastAndValidate(base);
  } catch (e) {
    return {
      ok: false,
      body:
        `the terminal increment was recorded, but the lifecycle flip would make "${id}" invalid:\n` +
        `${explainDocValidationError(base, e, { storedKeys: found.storedKeys })}\n` +
        "the arc is still OPEN — fix the doc and re-run `arc close` (it will refuse to duplicate the increment).",
      next: [`storytree arc show ${id} --pg`],
    };
  }
  const saved = await deps.store.upsertDoc({ id, kind: "arc", doc: valid, actor: deps.actor ?? defaultCliActor() });
  const date = opts.date?.trim() !== undefined && opts.date.trim() !== "" ? opts.date.trim() : deps.now.slice(0, 10);
  const pr = opts.pr?.trim();
  return {
    ok: true,
    body: [
      `closed arc ${saved.id} — ${date}${pr !== undefined && pr !== "" ? `  ${pr}` : ""}  ${outcome}`,
      "(lifecycle: closed; the terminal increment is its own row).",
      "It drops out of `storytree arc list` (--all / --closed still show it) and reads as archived on the library shelves.",
    ].join("\n"),
    next: [`storytree arc show ${saved.id} --pg`, "storytree arc list --pg"],
  };
}

export function arcHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree arc — the derived initiative view (ADR-0183): an arc reveals its increments / stories / ADRs by query.",
      "",
      "  storytree arc list [--all|--closed] [--pg]   the ACTIVE arcs (ADR-0239 D3): landed + open counts",
      "  storytree arc show <id> [--pg]               one arc: lifecycle / intent / end state / work / increment log",
      "",
      "AN ARC HOLDS INCREMENTS (ADR-0305 D1). What was `increments[]`, `proposals[]` and the `plan`",
      "kind is ONE tier now — an `increment` doc citing its arc, moving through",
      "proposal → ready → active → closed. So each entry is its OWN row: read one with",
      "`storytree library artifact <increment-id> --pg` (the whole body, not a summary), and CORRECT",
      "one with `storytree library artifact edit <increment-id> --pg`. There is no arc verb for",
      "either — that is the point of the fold.",
      "",
      "write an arc (validated write path — no fragile store one-shot; long prose via @path reads from a file):",
      '  storytree arc new [<id>] --title "..." --intent <text|@file> --end-state <text|@file> --pg',
      "        SCAFFOLD a new arc — the `adr new` precedent (ADR-0050). Supply the three required",
      "        fields; the CLI stamps kind / id / description / lifecycle / timestamps, so there is no",
      "        doc JSON to hand-write. The id is derived from the title (`-arc` suffix) unless you pass",
      "        one; `--description` overrides the one-liner derived from the intent. No number to",
      "        reserve — an arc id is a slug, so this is cheaper than `adr new`, not dearer.",
      "  storytree arc edit <id> [--intent <text|@file>] [--end-state <text|@file>] --pg",
      "",
      "the increment verbs:",
      "  storytree arc increment add <arc-id> --outcome <text|@file> [--pr <ref>] [--date] [--id <slug>] --pg",
      "        RECORD one landing — the merge-ceremony residue (ADR-0271). Creates a CLOSED increment;",
      "        title / objective / id are derived, so it still costs one command. Work that was PARKED",
      "        first should `increment close` its existing row instead of minting a second one.",
      '  storytree arc increment new <arc-id> --id <slug> --title "..." --objective <text|@file>',
      "        --body <text|@file> [--friction <id>]... --pg",
      "        PARK one decided-but-unbuilt unit of work. There is no way to park without naming an arc:",
      "        that is the decision, not an inconvenience — charter one first (`arc new`) when none fits.",
      "        `--friction <id>` (repeatable) is the DELIVERY CEILING'S JOIN: the entry goes RED on a later",
      "        session's gate once one of those friction items is reinforced after this entry was parked.",
      "        An entry with no --friction can never red, and the command says so.",
      "  storytree arc increment close <id> [--pr <ref>] [--date] [--note <text|@file>] --pg",
      "        Mark one increment TERMINAL — for ANY reason, not only a landing. `--note` is REQUIRED",
      "        when there is no `--pr`: ADR-0305 D2 dropped `superseded`/`retired` because the",
      "        difference was a REASON not a state, so a closure that is not a landing has to say why.",
      "        This is what lets a wrong or duplicate entry close honestly instead of reading as landed.",
      "",
      "  storytree arc close <id> --outcome <text|@file> [--pr <ref>] [--date <YYYY-MM-DD>] --pg",
      "        The terminal increment AND lifecycle: closed (ADR-0239 D2). --outcome is required — an",
      "        arc never closes without prose stating the end-state condition it met, and a bare",
      "        `library artifact edit --set lifecycle=closed` is refused. Re-opening is OWNER-only.",
      "        Since the fold this is TWO rows, written increment-first: an interrupted close leaves an",
      "        open arc with an extra increment, never a closed arc with no prose behind it.",
      "",
      "Every containment edge lives on the CHILD (increment.arcRef; ADR/story frontmatter `arc:` stamps",
      "via `storytree adr new --arc <id>`), so this view is derived-from-source and can never drift.",
      "Arcs are live-canonical and increments live-ONLY — run with --pg (pnpm db:up) for the real view.",
    ].join("\n"),
    next: [
      "storytree arc list --pg",
      "storytree arc show <id> --pg",
      'storytree arc new --title "<the initiative>" --intent "…" --end-state "…" --pg',
      "storytree arc increment add <arc-id> --outcome \"<what landed>\" --pr <ref> --pg",
      "storytree arc close <id> --outcome \"<the end-state condition met>\" --pg",
    ],
  };
}

/** Dispatch the `arc` area: `list [--all|--closed]` | `show <id>` | help. */
export async function arcCommand(
  sub: string | undefined,
  third: string | undefined,
  deps: ArcViewDeps,
  scope: ArcScope = "active",
): Promise<Envelope> {
  if (sub === undefined || sub === "help") return arcHelp();
  if (sub === "list") return arcList(deps, scope);
  if (sub === "show") return arcShow(deps, third);
  return {
    ok: false,
    body: `unknown arc command "${sub}". try: storytree arc list --pg  |  storytree arc show <id> --pg`,
    next: ["storytree arc list --pg"],
  };
}
