import type { Store, StoredDoc } from "@storytree/storage-protocol";
import { upcastAndValidate } from "@storytree/library";
import { arcIsClosed, loadArcRollup, storyArcStamps, type ArcRollup } from "@storytree/drive";

// The ADR scaffolder's kebab-caser, reused rather than copied: `arc new` derives an id slug from a
// title exactly as `adr new` derives a filename slug, and a second implementation would be a drift
// seam for no gain. The dependency runs one way only (`adr.ts` knows nothing of arcs).
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

/** One landed increment as stored on the arc doc (schema-validated upstream; read defensively here). */
interface IncrementRow {
  date?: string;
  pr?: string;
  outcome?: string;
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
  const arcs = await deps.store.queryDocs({ kind: "arc" });
  if (arcs.length === 0) {
    return {
      ok: true,
      body: deps.pg
        ? "no arcs in the live store yet — an arc is born when a multi-session initiative starts (ADR-0183 D6)."
        : "no arcs here — arcs are LIVE-canonical (and plans live-only), so the offline seed shows none. Re-run with --pg.",
      // This offer used to point at `library artifact new --file <arc.json>` — the hand-authoring path
      // that WAS the friction (`no-arc-new-scaffolder-verb`): it handed the reader a filename and left
      // them to reverse-engineer the schema. The scaffolder is the honest first move now.
      next: deps.pg
        ? ['storytree arc new --title "<the initiative>" --intent "…" --end-state "…" --pg']
        : ["storytree arc list --pg"],
    };
  }
  const sorted = [...arcs].sort((a, b) => a.id.localeCompare(b.id));
  const closedCount = sorted.filter((d) => arcIsClosed(d)).length;
  const shown =
    scope === "all" ? sorted : sorted.filter((d) => arcIsClosed(d) === (scope === "closed"));
  const width = Math.max(1, ...shown.map((d) => d.id.length));
  const rows = shown.map((d) => {
    const doc = d.doc as Record<string, unknown>;
    const increments = Array.isArray(doc["increments"]) ? (doc["increments"] as IncrementRow[]) : [];
    const last = increments[increments.length - 1];
    const lastNote = last ? `last ${last.date ?? "?"}${last.pr !== undefined ? ` ${last.pr}` : ""}` : "no landings yet";
    // The state tag rides every closed row so `--all` / `--closed` are never the old blind list;
    // under the default scope no closed arc is shown, so it never appears there.
    const tag = arcIsClosed(d) ? "[closed] " : "";
    return `  ${d.id.padEnd(width)}  ${increments.length} increment(s), ${lastNote}  — ${tag}${str(d, "title")}`;
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
      ...shown.slice(0, 3).map((d) => `storytree arc show ${d.id}${pgFlag}`),
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

  // The durable residue: the append-at-landing increment log (ADR-0183 D1).
  lines.push("## Increment log");
  if (rollup.increments.length === 0) lines.push("  (no landings yet)");
  for (const inc of rollup.increments) {
    lines.push(`  - ${inc.date ?? "?"}${inc.pr !== undefined ? `  ${inc.pr}` : ""}  ${inc.outcome ?? ""}`.trimEnd());
  }

  // The parked work the arc owns (ADR-0298 D1). Rendered as its OWN section immediately after the
  // increment log and never merged into it: the two have opposite lifecycles, and a reader who saw
  // them interleaved would read unbuilt intentions as things that happened (D4).
  const parked = rollup.proposals.filter((p) => p.realized === undefined);
  const realized = rollup.proposals.filter((p) => p.realized !== undefined);
  lines.push("", `## Parked work  (${parked.length} parked, ${realized.length} realized)`);
  if (rollup.proposals.length === 0) {
    lines.push("  (none — this arc has no deferred work parked on it)");
  }
  for (const p of parked) {
    lines.push(`  - ${p.id ?? "?"}  [parked ${(p.parked ?? "?").slice(0, 10)}]  — ${p.title ?? ""}`.trimEnd());
    if (p.summary) lines.push(`      ${p.summary}`);
    // The friction ids are printed because they are what the delivery ceiling joins on (D3): a
    // reader wondering why an entry went red can follow the edge without querying the store.
    if (p.frictionRefs !== undefined && p.frictionRefs.length > 0) {
      lines.push(`      from friction: ${p.frictionRefs.join(", ")}`);
    }
  }
  for (const p of realized) {
    const r = p.realized ?? {};
    lines.push(
      `  - ${p.id ?? "?"}  [realized ${r.date ?? "?"}${r.pr !== undefined ? ` ${r.pr}` : ""}]  — ${p.title ?? ""}`.trimEnd(),
    );
    if (r.note) lines.push(`      ${r.note}`);
  }

  // Derived children (D3: every edge lives on the CHILD; this view is a query, never authored).
  lines.push("", `## Plans  (derived: plan.arcRef → ${rollup.id})`);
  if (rollup.plans.length === 0) {
    lines.push(pg ? "  (none)" : "  (none visible OFFLINE — plans are live-only, ADR-0183 D2; try --pg)");
  }
  for (const p of rollup.plans) {
    lines.push(`  - ${p.id}  [${p.status}]  anchor ${p.anchorSha}  — ${p.title}`);
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

/** The ADR-0023 `next:` offers for one arc — its plans' freshness checks, then the artifact itself. */
function arcShowNext(rollup: ArcRollup, pg: boolean): string[] {
  return [
    ...rollup.plans.slice(0, 2).map((p) => `storytree plan check ${p.id}${pg ? " --pg" : ""}`),
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

/** Load an arc doc for a write, or return the honest miss/wrong-kind envelope (the arcShow messaging). */
async function loadArcForWrite(
  deps: ArcWriteDeps,
  id: string,
): Promise<{ doc: Record<string, unknown> } | { error: Envelope }> {
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
  return { doc };
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
    return { ok: false, body: `edit would make "${id}" invalid:\n${(e as Error).message}`, next: [`storytree arc show ${id} --pg`] };
  }
  const saved = await deps.store.upsertDoc({ id, kind: "arc", doc: valid, actor: deps.actor ?? defaultCliActor() });
  const changed = [opts.intent !== undefined ? "intent" : null, opts.endState !== undefined ? "endState" : null]
    .filter((s): s is string => s !== null)
    .join(", ");
  return { ok: true, body: `updated arc ${saved.id} (${changed}).`, next: [`storytree arc show ${saved.id} --pg`] };
}

/**
 * `storytree arc increment add <id> --outcome <text|@file> [--pr <ref>] [--date <YYYY-MM-DD>] --pg` —
 * APPEND one {@link ArcIncrement} to the arc's landing log (ADR-0183 D1: the durable residue). This is
 * the operation `library artifact edit --set` structurally CANNOT do (the log is an array of objects);
 * the old path was a raw `upsertDoc` one-shot that bypassed validation. `--outcome` is required (what
 * landed / halted / was re-planned); `--pr` is optional (an increment can close without its own PR);
 * `--date` defaults to today (the landing date). Re-validates the WHOLE arc — the new increment must
 * satisfy the ArcIncrement schema — then upserts (append-only, like the decision log).
 */
export async function arcIncrementAdd(
  deps: ArcWriteDeps,
  id: string | undefined,
  opts: { date?: string | undefined; pr?: string | undefined; outcome?: string | undefined },
): Promise<Envelope> {
  if (!deps.writable) return arcNotWritable("increment add");
  if (id === undefined) {
    return {
      ok: false,
      body: "arc increment add needs an id: storytree arc increment add <id> --outcome <text|@file> [--pr <ref>] [--date <YYYY-MM-DD>] --pg",
      next: ["storytree arc list --pg"],
    };
  }
  const outcome = opts.outcome?.trim();
  if (outcome === undefined || outcome === "") {
    return {
      ok: false,
      body: "arc increment add needs --outcome — what landed / halted / was re-planned (long prose: --outcome @path reads from a file).",
      next: [`storytree arc show ${id} --pg`],
    };
  }
  const found = await loadArcForWrite(deps, id);
  if ("error" in found) return found.error;

  const date = opts.date?.trim() !== undefined && opts.date.trim() !== "" ? opts.date.trim() : deps.now.slice(0, 10);
  const pr = opts.pr?.trim();
  const increment: Record<string, unknown> = { date, outcome, ...(pr !== undefined && pr !== "" ? { pr } : {}) };

  const base = found.doc;
  const priorIncrements = Array.isArray(base["increments"]) ? [...(base["increments"] as unknown[])] : [];
  base["increments"] = [...priorIncrements, increment];
  base["updatedAt"] = deps.now;

  let valid: unknown;
  try {
    valid = upcastAndValidate(base);
  } catch (e) {
    return { ok: false, body: `increment would make "${id}" invalid:\n${(e as Error).message}`, next: [`storytree arc show ${id} --pg`] };
  }
  const saved = await deps.store.upsertDoc({ id, kind: "arc", doc: valid, actor: deps.actor ?? defaultCliActor() });
  const count = Array.isArray((valid as Record<string, unknown>)["increments"])
    ? ((valid as Record<string, unknown>)["increments"] as unknown[]).length
    : 0;

  // ADR-0239 D4 — the closure reminder lives HERE, in the output of the command the situation forces
  // you to run, not in any agent prompt or the generated CLAUDE.md region. Cost: zero context for
  // every session that is not landing an arc increment, which is almost all of them (the ADR-0023
  // pull model applied to a ceremony step). The session that just appended an increment reads the
  // closure question at the exact moment it can answer it, against the arc's OWN stored end state —
  // echoed back so the judgment is made from data, not memory. It never asserts the end state was
  // met; the "(if …)" is load-bearing, since that call is irreducibly the session's.
  const validDoc = valid as Record<string, unknown>;
  const endState = typeof validDoc["endState"] === "string" ? validDoc["endState"] : "";
  const alreadyClosed = validDoc["lifecycle"] === "closed";
  const closureHint = !alreadyClosed && endState !== "" ? `\n\nthis arc's end state: ${endState}` : "";

  return {
    ok: true,
    body:
      `appended increment to arc ${saved.id} — ${date}${pr !== undefined && pr !== "" ? `  ${pr}` : ""}  ${outcome}\n(${count} increment(s) now).` +
      closureHint,
    next: [
      `storytree arc show ${saved.id} --pg`,
      ...(alreadyClosed
        ? []
        : [`storytree arc close ${saved.id} --outcome "…" --pg  (if this landing met the end state)`]),
    ],
  };
}

/** The body fields a parked entry carries, in the retired `proposal` KIND_SPECS order (ADR-0298 D1). */
export interface ArcProposalBodyOpts {
  summary?: string | undefined;
  motivation?: string | undefined;
  change?: string | undefined;
  scope?: string | undefined;
  migration?: string | undefined;
  readiness?: string | undefined;
  risks?: string | undefined;
}

/** The five OPTIONAL body fields, in render order — the shared list the add verb copies through. */
const OPTIONAL_PROPOSAL_FIELDS = ["change", "scope", "migration", "readiness", "risks"] as const;

/**
 * `storytree arc proposal add <arc-id> --id <slug> --title "…" --summary <text|@file>
 * --motivation <text|@file> [--change|--scope|--migration|--readiness|--risks <text|@file>]
 * [--friction <id>]... --pg` — PARK one unit of deferred work on the arc that owns it (ADR-0298 D1).
 *
 * This is the successor to `storytree proposal new`, and the difference is the whole decision: there
 * is no way to park work without naming an arc, so a remedy can no longer arrive detached from the
 * initiative that carries it. Charter one first (`storytree arc new`) when none fits — that stays
 * first-class and free (D6); what is refused is a HOMELESS item, not a new arc.
 *
 * `parked` is stamped from the composition-root clock and is never caller-supplied: it is the
 * delivery ceiling's comparison point (D3), so a caller able to backdate it could silence the very
 * recurrences that select an entry. Re-validates the WHOLE arc, then upserts.
 */
export async function arcProposalAdd(
  deps: ArcWriteDeps,
  arcId: string | undefined,
  opts: ArcProposalBodyOpts & { id?: string | undefined; title?: string | undefined; friction?: string[] | undefined },
): Promise<Envelope> {
  if (!deps.writable) return arcNotWritable("proposal add");
  if (arcId === undefined) {
    return {
      ok: false,
      body: 'arc proposal add needs an arc id: storytree arc proposal add <arc-id> --id <slug> --title "…" --summary <text|@file> --motivation <text|@file> --pg',
      next: ["storytree arc list --pg", 'storytree arc new --title "…" --intent @file --end-state @file --pg'],
    };
  }
  const entryId = opts.id?.trim();
  const title = opts.title?.trim();
  const summary = opts.summary?.trim();
  const motivation = opts.motivation?.trim();
  const missing = [
    entryId === undefined || entryId === "" ? "--id <slug>" : "",
    title === undefined || title === "" ? '--title "…"' : "",
    summary === undefined || summary === "" ? "--summary <text|@file>" : "",
    motivation === undefined || motivation === "" ? "--motivation <text|@file>" : "",
  ].filter((s) => s !== "");
  if (missing.length > 0 || entryId === undefined || title === undefined || summary === undefined || motivation === undefined) {
    return {
      ok: false,
      body:
        `arc proposal add needs ${missing.join(", ")}.\n` +
        "`--motivation` is required for the same reason `friction new` demands evidence: a parked entry with no stated cost of NOT doing it is the thin filing this tier exists to prevent (long prose: --field @path reads from a file).",
      next: [`storytree arc show ${arcId} --pg`],
    };
  }

  const found = await loadArcForWrite(deps, arcId);
  if ("error" in found) return found.error;
  const base = found.doc;

  const prior = Array.isArray(base["proposals"]) ? [...(base["proposals"] as unknown[])] : [];
  // A duplicate id inside one arc would make `arc proposal realize --id` ambiguous, so it is refused
  // rather than resolved by a first-match rule nobody would predict.
  const clash = prior.some(
    (p) => typeof p === "object" && p !== null && (p as Record<string, unknown>)["id"] === entryId,
  );
  if (clash) {
    return {
      ok: false,
      body: `arc ${arcId} already carries a parked entry "${entryId}" — ids are unique within an arc so \`arc proposal realize --id\` is unambiguous.`,
      next: [`storytree arc show ${arcId} --pg`],
    };
  }

  const frictionRefs = (opts.friction ?? []).map((f) => f.trim()).filter((f) => f !== "");
  const entry: Record<string, unknown> = {
    id: entryId,
    title,
    parked: deps.now,
    summary,
    motivation,
  };
  for (const field of OPTIONAL_PROPOSAL_FIELDS) {
    const v = opts[field]?.trim();
    if (v !== undefined && v !== "") entry[field] = v;
  }
  if (frictionRefs.length > 0) entry["frictionRefs"] = frictionRefs;

  base["proposals"] = [...prior, entry];
  base["updatedAt"] = deps.now;

  let valid: unknown;
  try {
    valid = upcastAndValidate(base);
  } catch (e) {
    return {
      ok: false,
      body: `parking "${entryId}" would make arc "${arcId}" invalid:\n${(e as Error).message}`,
      next: [`storytree arc show ${arcId} --pg`],
    };
  }
  const saved = await deps.store.upsertDoc({ id: arcId, kind: "arc", doc: valid, actor: deps.actor ?? defaultCliActor() });
  const parkedCount = (((valid as Record<string, unknown>)["proposals"] as unknown[]) ?? []).filter(
    (p) => typeof p === "object" && p !== null && (p as Record<string, unknown>)["realized"] === undefined,
  ).length;

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
    body:
      `parked "${entryId}" on arc ${saved.id} — ${title}\n(${parkedCount} parked entr(ies) now.)` +
      uncited,
    next: [
      `storytree arc show ${saved.id} --pg`,
      ...(frictionRefs.length > 0
        ? [
            `storytree friction route ${frictionRefs[0]} --route tool --reason @<file> --arc ${saved.id} --pg`,
          ]
        : []),
      `storytree arc proposal realize ${saved.id} --id ${entryId} --pr <ref> --pg   (when it lands)`,
    ],
  };
}

/**
 * `storytree arc proposal realize <arc-id> --id <slug> [--pr <ref>] [--date <YYYY-MM-DD>]
 * [--note <text|@file>] --pg` — mark a parked entry as LANDED (ADR-0298 D3/D4).
 *
 * This is the delivery ceiling's structural discharge, and it is deliberately cheap because it rides
 * a step the closing leg already performs (ADR-0271: append the increment, release the claims). The
 * retired tier's only discharge was a manual `friction --discharged-by` stamp, measured at 6-of-125
 * and called a FLOOR precisely because it is expensive enough to skip.
 *
 * The entry is MARKED, never deleted: retiring a realized proposal left nothing behind but a
 * retirement reason, whereas a realized entry sits next to the increment that discharged it.
 */
export async function arcProposalRealize(
  deps: ArcWriteDeps,
  arcId: string | undefined,
  opts: { id?: string | undefined; pr?: string | undefined; date?: string | undefined; note?: string | undefined },
): Promise<Envelope> {
  if (!deps.writable) return arcNotWritable("proposal realize");
  const entryId = opts.id?.trim();
  if (arcId === undefined || entryId === undefined || entryId === "") {
    return {
      ok: false,
      body: "arc proposal realize needs an arc id and --id <slug>: storytree arc proposal realize <arc-id> --id <slug> --pr <ref> --pg",
      next: ["storytree arc list --pg"],
    };
  }
  const found = await loadArcForWrite(deps, arcId);
  if ("error" in found) return found.error;
  const base = found.doc;

  const prior = Array.isArray(base["proposals"]) ? [...(base["proposals"] as unknown[])] : [];
  const idx = prior.findIndex(
    (p) => typeof p === "object" && p !== null && (p as Record<string, unknown>)["id"] === entryId,
  );
  if (idx === -1) {
    const known = prior
      .map((p) => (typeof p === "object" && p !== null ? (p as Record<string, unknown>)["id"] : undefined))
      .filter((s): s is string => typeof s === "string");
    return {
      ok: false,
      body:
        `arc ${arcId} carries no parked entry "${entryId}".` +
        (known.length > 0 ? `\nparked here: ${known.join(", ")}` : "\n(this arc has no parked work.)"),
      next: [`storytree arc show ${arcId} --pg`],
    };
  }
  const entry = { ...(prior[idx] as Record<string, unknown>) };
  if (entry["realized"] !== undefined) {
    return {
      ok: false,
      body: `"${entryId}" on arc ${arcId} is already realized — realization is recorded once, like an increment.`,
      next: [`storytree arc show ${arcId} --pg`],
    };
  }

  const date = opts.date?.trim() !== undefined && opts.date.trim() !== "" ? opts.date.trim() : deps.now.slice(0, 10);
  const pr = opts.pr?.trim();
  const note = opts.note?.trim();
  entry["realized"] = {
    date,
    ...(pr !== undefined && pr !== "" ? { pr } : {}),
    ...(note !== undefined && note !== "" ? { note } : {}),
  };
  prior[idx] = entry;
  base["proposals"] = prior;
  base["updatedAt"] = deps.now;

  let valid: unknown;
  try {
    valid = upcastAndValidate(base);
  } catch (e) {
    return {
      ok: false,
      body: `realizing "${entryId}" would make arc "${arcId}" invalid:\n${(e as Error).message}`,
      next: [`storytree arc show ${arcId} --pg`],
    };
  }
  const saved = await deps.store.upsertDoc({ id: arcId, kind: "arc", doc: valid, actor: deps.actor ?? defaultCliActor() });
  const stillParked = (((valid as Record<string, unknown>)["proposals"] as unknown[]) ?? []).filter(
    (p) => typeof p === "object" && p !== null && (p as Record<string, unknown>)["realized"] === undefined,
  ).length;

  return {
    ok: true,
    body: `realized "${entryId}" on arc ${saved.id} — ${date}${pr !== undefined && pr !== "" ? `  ${pr}` : ""}\n(${stillParked} still parked.)`,
    next: [
      `storytree arc increment add ${saved.id} --outcome @<file> --pr ${pr ?? "<ref>"} --pg   (the landing log)`,
      `storytree arc show ${saved.id} --pg`,
    ],
  };
}

/**
 * `storytree arc close <id> --outcome <text|@file> [--pr <ref>] [--date <YYYY-MM-DD>] --pg` — the
 * ONE closing verb (ADR-0239 D2): it appends the terminal increment AND sets `lifecycle: closed` in
 * a SINGLE validated upsert, so the state and the prose that justifies it can never be written apart.
 *
 * `--outcome` is REQUIRED and that is the whole design: an arc cannot go closed without a terminal
 * increment stating the observable `endState` condition it met. This is the ADR-0084/0086 discipline
 * applied unchanged — a status is a projection of prose that supports it, never a free flip — which
 * is also why `library artifact edit --set lifecycle=closed` is refused at the generic edit surface.
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

  const date = opts.date?.trim() !== undefined && opts.date.trim() !== "" ? opts.date.trim() : deps.now.slice(0, 10);
  const pr = opts.pr?.trim();
  const increment: Record<string, unknown> = { date, outcome, ...(pr !== undefined && pr !== "" ? { pr } : {}) };

  const priorIncrements = Array.isArray(base["increments"]) ? [...(base["increments"] as unknown[])] : [];
  base["increments"] = [...priorIncrements, increment];
  base["lifecycle"] = "closed";
  base["updatedAt"] = deps.now;

  let valid: unknown;
  try {
    valid = upcastAndValidate(base);
  } catch (e) {
    return { ok: false, body: `close would make "${id}" invalid:\n${(e as Error).message}`, next: [`storytree arc show ${id} --pg`] };
  }
  // ONE upsert — the terminal increment and the flip land together or not at all.
  const saved = await deps.store.upsertDoc({ id, kind: "arc", doc: valid, actor: deps.actor ?? defaultCliActor() });
  const count = Array.isArray((valid as Record<string, unknown>)["increments"])
    ? ((valid as Record<string, unknown>)["increments"] as unknown[]).length
    : 0;
  return {
    ok: true,
    body: [
      `closed arc ${saved.id} — ${date}${pr !== undefined && pr !== "" ? `  ${pr}` : ""}  ${outcome}`,
      `(${count} increment(s); lifecycle: closed).`,
      "It drops out of `storytree arc list` (--all / --closed still show it) and reads as archived on the library shelves.",
    ].join("\n"),
    next: [`storytree arc show ${saved.id} --pg`, "storytree arc list --pg"],
  };
}

export function arcHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree arc — the derived initiative view (ADR-0183): an arc reveals its plans / stories / ADRs by query.",
      "",
      "  storytree arc list [--all|--closed] [--pg]   the ACTIVE arcs (ADR-0239 D3): intent + increment log summary",
      "  storytree arc show <id> [--pg]               one arc, closed or not: lifecycle / intent / end state / increments",
      "",
      "write an arc (validated write path — no fragile store one-shot; long prose via @path reads from a file):",
      '  storytree arc new [<id>] --title "..." --intent <text|@file> --end-state <text|@file> --pg',
      "        SCAFFOLD a new arc — the `adr new` precedent (ADR-0050). Supply the three required",
      "        fields; the CLI stamps kind / id / description / lifecycle / timestamps, so there is no",
      "        doc JSON to hand-write. The id is derived from the title (`-arc` suffix) unless you pass",
      "        one; `--description` overrides the one-liner derived from the intent. No number to",
      "        reserve — an arc id is a slug, so this is cheaper than `adr new`, not dearer.",
      "  storytree arc edit <id> [--intent <text|@file>] [--end-state <text|@file>] --pg",
      "  storytree arc increment add <id> --outcome <text|@file> [--pr <ref>] [--date <YYYY-MM-DD>] --pg",
      "        APPEND one landing to the increment log (ADR-0183 D1) — the merge-ceremony residue.",
      "",
      "park deferred work ON the arc that owns it (ADR-0298 — the retired `proposal` kind's successor):",
      '  storytree arc proposal add <arc-id> --id <slug> --title "..." --summary <text|@file>',
      "        --motivation <text|@file> [--change|--scope|--migration|--readiness|--risks <text|@file>]",
      "        [--friction <id>]... --pg",
      "        PARK one decided-but-unbuilt unit of work. There is no way to park without naming an arc:",
      "        that is the decision, not an inconvenience — charter one first (`arc new`) when none fits.",
      "        `--friction <id>` (repeatable) is the DELIVERY CEILING'S JOIN: the entry goes RED on a later",
      "        session's gate once one of those friction items is reinforced after this entry was parked.",
      "        An entry with no --friction can never red, and the command says so.",
      "  storytree arc proposal realize <arc-id> --id <slug> [--pr <ref>] [--date] [--note <text|@file>] --pg",
      "        Mark a parked entry LANDED — the ceiling's discharge, run in the closing leg beside",
      "        `increment add`. The entry is MARKED, never deleted, so it sits next to the increment.",
      "",
      "  storytree arc close <id> --outcome <text|@file> [--pr <ref>] [--date <YYYY-MM-DD>] --pg",
      "        The terminal increment AND lifecycle: closed, in one write (ADR-0239 D2). --outcome is",
      "        required — an arc never closes without prose stating the end-state condition it met, and",
      "        a bare `library artifact edit --set lifecycle=closed` is refused. Re-opening is OWNER-only.",
      "",
      "Every containment edge lives on the CHILD (plan.arcRef; ADR/story frontmatter `arc:` stamps via",
      "`storytree adr new --arc <id>`), so this view is derived-from-source and can never drift.",
      "Arcs are live-canonical and plans live-ONLY — run with --pg (pnpm db:up) for the real view.",
    ].join("\n"),
    next: [
      "storytree arc list --pg",
      "storytree arc show <id> --pg",
      'storytree arc new --title "<the initiative>" --intent "…" --end-state "…" --pg',
      "storytree arc increment add <id> --outcome \"<what landed>\" --pr <ref> --pg",
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
