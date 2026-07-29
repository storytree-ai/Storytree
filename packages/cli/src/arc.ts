import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { Store, StoredDoc } from "@storytree/storage-protocol";
import { upcastAndValidate } from "@storytree/library";

import { loadAdrListings } from "./adr.js";
import type { Envelope } from "./envelope.js";

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
 * PURE: the `arc:` stamps across a stories tree — `stories/<dir>/story.md` frontmatter carrying
 * `arc: <id>` (ADR-0183 D3: the story-side provenance stamp). Stories without the stamp are simply
 * absent; a missing/unreadable file never throws (the view stays derivable on a partial checkout).
 */
export function storyArcStamps(storiesDir: string): { story: string; arc: string }[] {
  const out: { story: string; arc: string }[] = [];
  let dirs: string[];
  try {
    dirs = readdirSync(storiesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return out;
  }
  for (const dir of dirs) {
    const file = path.join(storiesDir, dir, "story.md");
    if (!existsSync(file)) continue;
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!content.startsWith("---")) continue;
    const end = content.indexOf("\n---", 3);
    if (end === -1) continue;
    const fm = content.slice(0, end);
    const m = /^arc:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m.exec(fm);
    if (m && m[1] !== undefined) out.push({ story: dir, arc: m[1] });
  }
  return out;
}

/** The arc a plan doc cites (`arcRef: "asset:<id>"`), or null when unreadable. */
function planArcOf(stored: StoredDoc): string | null {
  const ref = str(stored, "arcRef");
  return ref.startsWith("asset:") ? ref.slice("asset:".length) : null;
}

/**
 * PURE: an arc's stored closure state (ADR-0239 D1), read defensively off an untyped doc. Only the
 * exact `"closed"` the schema enum fences is closure — an absent, empty, or unrecognised value is an
 * arc still IN FLIGHT, so a doc this code doesn't understand stays in the worklist instead of
 * silently vanishing from it (`lifecycleOf`'s fail-open arc branch, applied at the render surface).
 */
export function arcIsClosed(stored: StoredDoc): boolean {
  return (stored.doc as Record<string, unknown>)["lifecycle"] === "closed";
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
      next: deps.pg ? ["storytree library artifact new --file <arc.json> --pg"] : ["storytree arc list --pg"],
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

  // `arc show` renders ANY arc regardless of lifecycle (ADR-0239 D3 — only the LIST filters) and
  // states which it is, so a closed initiative is readable without being mistaken for live work.
  const closed = arcIsClosed(stored);
  const lines: string[] = [
    `# ${str(stored, "title")}    [arc]`,
    `id: ${id}`,
    `lifecycle: ${closed ? "closed — its end state was met; it is out of the default arc list" : "active (in flight)"}`,
    "",
  ];
  const intent = str(stored, "intent");
  if (intent) lines.push(`**The intent.** ${intent}`, "");
  const endState = str(stored, "endState");
  if (endState) lines.push("## End state", "", endState, "");

  // The durable residue: the append-at-landing increment log (ADR-0183 D1).
  const doc = stored.doc as Record<string, unknown>;
  const increments = Array.isArray(doc["increments"]) ? (doc["increments"] as IncrementRow[]) : [];
  lines.push("## Increment log");
  if (increments.length === 0) lines.push("  (no landings yet)");
  for (const inc of increments) {
    lines.push(`  - ${inc.date ?? "?"}${inc.pr !== undefined ? `  ${inc.pr}` : ""}  ${inc.outcome ?? ""}`.trimEnd());
  }

  // Derived children (D3: every edge lives on the CHILD; this view is a query, never authored).
  const plans = (await deps.store.queryDocs({ kind: "plan" })).filter((p) => planArcOf(p) === id);
  lines.push("", `## Plans  (derived: plan.arcRef → ${id})`);
  if (plans.length === 0) {
    lines.push(deps.pg ? "  (none)" : "  (none visible OFFLINE — plans are live-only, ADR-0183 D2; try --pg)");
  }
  for (const p of [...plans].sort((a, b) => a.id.localeCompare(b.id))) {
    const pd = p.doc as Record<string, unknown>;
    const status = typeof pd["status"] === "string" ? (pd["status"] as string) : "?";
    const anchor = pd["anchor"] as Record<string, unknown> | undefined;
    const sha = anchor && typeof anchor["sha"] === "string" ? (anchor["sha"] as string).slice(0, 9) : "?";
    lines.push(`  - ${p.id}  [${status}]  anchor ${sha}  — ${str(p, "title")}`);
  }

  const { listings } = loadAdrListings(deps.decisionsDir);
  const adrs = listings.filter((l) => l.meta.arc === id);
  lines.push("", `## ADRs  (derived: frontmatter arc: ${id})`);
  if (adrs.length === 0) lines.push("  (none)");
  for (const l of adrs) {
    lines.push(`  - ADR-${String(l.meta.number).padStart(4, "0")}  ${l.meta.status.padEnd(10)} ${l.title}`);
  }

  const stories = storyArcStamps(deps.storiesDir).filter((s) => s.arc === id);
  lines.push("", `## Stories  (derived: story frontmatter arc: ${id})`);
  if (stories.length === 0) lines.push("  (none)");
  for (const s of stories) lines.push(`  - ${s.story}`);

  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      ...plans.slice(0, 2).map((p) => `storytree plan check ${p.id} --pg`),
      `storytree library artifact ${id}${deps.pg ? " --pg" : ""}`,
    ],
  };
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
  const saved = await deps.store.upsertDoc({ id, kind: "arc", doc: valid, actor: deps.actor ?? "cli" });
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
  const saved = await deps.store.upsertDoc({ id, kind: "arc", doc: valid, actor: deps.actor ?? "cli" });
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
  const saved = await deps.store.upsertDoc({ id, kind: "arc", doc: valid, actor: deps.actor ?? "cli" });
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
      "edit an arc (validated write path — no fragile store one-shot; long prose via @path reads from a file):",
      "  storytree arc edit <id> [--intent <text|@file>] [--end-state <text|@file>] --pg",
      "  storytree arc increment add <id> --outcome <text|@file> [--pr <ref>] [--date <YYYY-MM-DD>] --pg",
      "        APPEND one landing to the increment log (ADR-0183 D1) — the merge-ceremony residue.",
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
