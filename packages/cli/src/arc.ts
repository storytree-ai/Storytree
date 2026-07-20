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
 *   storytree arc list [--pg]        every arc: intent + increment count
 *   storytree arc show <id> [--pg]   one arc: intent / end state / increment log + derived children
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

async function arcList(deps: ArcViewDeps): Promise<Envelope> {
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
  const width = Math.max(1, ...sorted.map((d) => d.id.length));
  const rows = sorted.map((d) => {
    const doc = d.doc as Record<string, unknown>;
    const increments = Array.isArray(doc["increments"]) ? (doc["increments"] as IncrementRow[]) : [];
    const last = increments[increments.length - 1];
    const lastNote = last ? `last ${last.date ?? "?"}${last.pr !== undefined ? ` ${last.pr}` : ""}` : "no landings yet";
    return `  ${d.id.padEnd(width)}  ${increments.length} increment(s), ${lastNote}  — ${str(d, "title")}`;
  });
  return {
    ok: true,
    body: [`storytree arc — ${sorted.length} arc(s)`, "", ...rows].join("\n"),
    next: sorted.slice(0, 3).map((d) => `storytree arc show ${d.id}${deps.pg ? " --pg" : ""}`),
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

  const lines: string[] = [`# ${str(stored, "title")}    [arc]`, `id: ${id}`, ""];
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
  return {
    ok: true,
    body: `appended increment to arc ${saved.id} — ${date}${pr !== undefined && pr !== "" ? `  ${pr}` : ""}  ${outcome}\n(${count} increment(s) now).`,
    next: [`storytree arc show ${saved.id} --pg`],
  };
}

export function arcHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree arc — the derived initiative view (ADR-0183): an arc reveals its plans / stories / ADRs by query.",
      "",
      "  storytree arc list [--pg]        every arc: intent + increment log summary",
      "  storytree arc show <id> [--pg]   one arc: intent / end state / increments + derived children",
      "",
      "edit an arc (validated write path — no fragile store one-shot; long prose via @path reads from a file):",
      "  storytree arc edit <id> [--intent <text|@file>] [--end-state <text|@file>] --pg",
      "  storytree arc increment add <id> --outcome <text|@file> [--pr <ref>] [--date <YYYY-MM-DD>] --pg",
      "        APPEND one landing to the increment log (ADR-0183 D1) — the merge-ceremony residue.",
      "",
      "Every containment edge lives on the CHILD (plan.arcRef; ADR/story frontmatter `arc:` stamps via",
      "`storytree adr new --arc <id>`), so this view is derived-from-source and can never drift.",
      "Arcs are live-canonical and plans live-ONLY — run with --pg (pnpm db:up) for the real view.",
    ].join("\n"),
    next: [
      "storytree arc list --pg",
      "storytree arc show <id> --pg",
      "storytree arc increment add <id> --outcome \"<what landed>\" --pr <ref> --pg",
    ],
  };
}

/** Dispatch the `arc` area: `list` | `show <id>` | help. */
export async function arcCommand(
  sub: string | undefined,
  third: string | undefined,
  deps: ArcViewDeps,
): Promise<Envelope> {
  if (sub === undefined || sub === "help") return arcHelp();
  if (sub === "list") return arcList(deps);
  if (sub === "show") return arcShow(deps, third);
  return {
    ok: false,
    body: `unknown arc command "${sub}". try: storytree arc list --pg  |  storytree arc show <id> --pg`,
    next: ["storytree arc list --pg"],
  };
}
