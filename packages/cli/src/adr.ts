import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parseAdrFrontmatter, type AdrMeta, type AdrStatus } from "@storytree/drive";
import type { Envelope } from "./envelope.js";

/**
 * `storytree adr new` (ADR-0050): allocate the next ADR number ATOMICALLY from the live store and
 * scaffold `docs/decisions/NNNN-slug.md`, so two parallel sessions can never pick the same number
 * (the recurring collision). The DB allocator is the proactive prevention; a CI dup-number gate
 * (adr-health) is the backstop that makes any slip un-mergeable.
 *
 *   storytree adr new --title "..." [--supersedes 42] [--amends 42,43] --pg
 *   storytree adr next --pg                          reserve a number only (author the file by hand)
 *
 * OFFLINE (no --pg): falls back to `max-on-disk + 1` with a LOUD warning that the number was NOT
 * reserved — so an offline/web session is unblocked, and the CI gate catches a rare collision before
 * merge. With --pg the number is reserved transactionally and can't collide with another session.
 */

/** The store seam — `PgAdrStore.allocate` when --pg; null offline. */
export interface AdrAllocatorLike {
  allocate(a: {
    localMax: number;
    slug: string;
    branch: string;
    actor: string;
  }): Promise<{ number: number }>;
}

export interface AdrCommandDeps {
  /** The live allocator (--pg); null = offline (max+1 fallback). */
  allocator: AdrAllocatorLike | null;
  /** The docs/decisions directory to scan + scaffold into (injectable for tests). */
  decisionsDir: string;
  /** The git branch the allocation is recorded against (audit only); best-effort. */
  branch: string;
  /** Recorded as the allocation `actor`. */
  actor: string;
  /** Today as `YYYY-MM-DD` — the `decided:` date of an owner-directed scaffold (injected; ADR-0110). */
  today: string;
}

export interface AdrCommandOpts {
  title?: string | undefined;
  supersedes?: string | undefined;
  amends?: string | undefined;
  /**
   * `--decided` (ADR-0110): the owner DIRECTED this decision in conversation, so scaffold it born
   * `accepted` + `decided: <today>` instead of `proposed` — design-time alignment IS ratification, no
   * second end-of-flow ask. Absent = the born-`proposed` default for a still-thinking ADR (ADR-0050).
   */
  decided?: boolean | undefined;
  /**
   * `--arc <id>` (ADR-0183 D3): the Library `arc` artifact this decision was produced under.
   * Stamped into the scaffold's frontmatter at creation and immutable thereafter — provenance,
   * never authority. The arc's ADR view is derived from these child stamps (`storytree arc show`).
   */
  arc?: string | undefined;
  /** `adr list` filters (ADR-0086). */
  current?: boolean | undefined;
  loadBearing?: boolean | undefined;
  status?: string | undefined;
}

/** PURE: kebab-case slug from a title (a-z0-9, hyphen-separated), capped so filenames stay sane. */
export function kebabSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** The highest ADR number on disk (0 if none/unreadable) — the reconciliation floor for the allocator. */
export function maxAdrNumber(decisionsDir: string): number {
  let max = 0;
  try {
    for (const f of readdirSync(decisionsDir)) {
      const m = /^(\d{4})-.*\.md$/.exec(f);
      if (m && m[1] !== undefined) max = Math.max(max, Number(m[1]));
    }
  } catch {
    /* dir missing → 0 */
  }
  return max;
}

/** PURE: parse a `--supersedes 42,43` / `--amends 7` value into a positive-int list (drops junk). */
export function parseEdges(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
}

const pad = (n: number): string => String(n).padStart(4, "0");

/**
 * PURE: the scaffold body for a fresh ADR — frontmatter + H1 + the standard sections.
 *
 * Default (no `decided`): born `proposed` (ADR-0050) — the scaffold for a still-thinking ADR, left for
 * the author to fill in. When `decided` (an ISO `YYYY-MM-DD`) is supplied, the ADR is instead born
 * `accepted` with `decided: <date>` and a `## Status` line recording the owner's design-time directive:
 * the OWNER-DIRECTED path of ADR-0110 (Option A) — when the owner explicitly directs a decision in a
 * design conversation, alignment IS ratification, so there is no second end-of-flow ratification ask.
 * Amends ADR-0050's unconditionally-born-`proposed` scaffold (the mechanical root of the double-ask).
 */
export function scaffold(
  n: number,
  title: string,
  edges: { supersedes: number[]; amends: number[] },
  decided?: string,
  arc?: string,
): string {
  const ownerDirected = decided !== undefined && decided !== "";
  const fm = ["---", `status: ${ownerDirected ? "accepted" : "proposed"}`];
  if (ownerDirected) fm.push(`decided: ${decided}`);
  if (edges.supersedes.length > 0) fm.push(`supersedes: [${edges.supersedes.join(", ")}]`);
  if (edges.amends.length > 0) fm.push(`amends: [${edges.amends.join(", ")}]`);
  // The ADR-0183 D3 provenance stamp: "arc X produced me" — set at creation, never edited.
  if (arc !== undefined && arc !== "") fm.push(`arc: ${arc}`);
  fm.push("---", "");
  const edgeProse =
    edges.supersedes.length > 0 || edges.amends.length > 0
      ? [
          edges.supersedes.length > 0
            ? `**Supersedes** ${edges.supersedes.map((e) => `ADR-${pad(e)}`).join(", ")} — <why; flip their status to superseded>.`
            : "",
          edges.amends.length > 0
            ? `**Amends** ${edges.amends.map((e) => `ADR-${pad(e)}`).join(", ")} — <what this extends/narrows, without overturning>.`
            : "",
        ].filter((s) => s !== "")
      : [];
  const statusLine = ownerDirected
    ? `accepted (${decided}) — decided/directed by the owner in conversation on ${decided}. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.`
    : "proposed — <one line: who decided / when / why>.";
  const body = [
    `# ADR-${pad(n)}: ${title}`,
    "",
    "## Status",
    "",
    statusLine,
    ...(edgeProse.length > 0 ? ["", ...edgeProse] : []),
    "",
    "## Context",
    "",
    "<the problem and the forces in play>.",
    "",
    "## Decision",
    "",
    "<what we are doing>.",
    "",
    "## Consequences",
    "",
    "<what follows — good and bad>.",
    "",
    "## References",
    "",
    "- <related ADRs / code / docs>.",
    "",
  ];
  return fm.join("\n") + body.join("\n");
}

/** Display path for the scaffolded file (conventional location, regardless of the temp dir in tests). */
function displayPath(decisionsDir: string, base: string): string {
  // Show docs/decisions/<file> when the dir ends in that; otherwise the dir + file (tests).
  return /[\\/]docs[\\/]decisions$/.test(decisionsDir)
    ? `docs/decisions/${base}`
    : path.join(decisionsDir, base);
}

async function adrNew(opts: AdrCommandOpts, deps: AdrCommandDeps): Promise<Envelope> {
  const title = opts.title?.trim() ?? "";
  if (!title) {
    return {
      ok: false,
      body: 'adr new needs a title:  storytree adr new --title "Short imperative title" --pg',
      next: ["storytree adr new --title \"...\" --pg"],
    };
  }
  const slug = kebabSlug(title);
  if (!slug) {
    return { ok: false, body: `could not derive a slug from "${title}" — use letters/numbers.`, next: [] };
  }
  const localMax = maxAdrNumber(deps.decisionsDir);
  const edges = { supersedes: parseEdges(opts.supersedes), amends: parseEdges(opts.amends) };

  let n: number;
  let reserved: boolean;
  if (deps.allocator) {
    try {
      const r = await deps.allocator.allocate({ localMax, slug, branch: deps.branch, actor: deps.actor });
      n = r.number;
      reserved = true;
    } catch (e) {
      return {
        ok: false,
        body:
          `couldn't reserve an ADR number from the DB: ${(e as Error).message}\n` +
          "bring the store up (pnpm db:up), or omit --pg to use the offline max+1 fallback.",
        next: ["pnpm db:up", 'storytree adr new --title "..." --pg'],
      };
    }
  } else {
    n = localMax + 1;
    reserved = false;
  }

  const base = `${pad(n)}-${slug}.md`;
  const file = path.join(deps.decisionsDir, base);
  if (existsSync(file)) {
    return {
      ok: false,
      body: `${base} already exists — pick a different title, or edit the existing file.`,
      next: [`open ${displayPath(deps.decisionsDir, base)}`],
    };
  }
  // --decided (ADR-0110): the owner directed this in conversation → born accepted with today's date.
  const decided = opts.decided === true ? deps.today : undefined;
  writeFileSync(file, scaffold(n, title, edges, decided, opts.arc?.trim() || undefined), "utf8");

  const rel = displayPath(deps.decisionsDir, base);
  const lines = [
    `ADR-${pad(n)} ${reserved ? "reserved in the DB" : "allocated OFFLINE (max+1)"} → ${rel}`,
    "",
    `# ADR-${pad(n)}: ${title}`,
    decided !== undefined
      ? `Scaffolded ACCEPTED (owner-directed, decided ${decided} — ADR-0110) — fill in Context / Decision / Consequences, then commit.`
      : "Scaffolded with proposed status — fill in Status / Context / Decision / Consequences, then commit.",
  ];
  if (!reserved) {
    lines.push(
      "",
      "⚠️  OFFLINE: this number was NOT reserved — a parallel session could pick the same one.",
      "    Re-run with --pg when the DB is up (pnpm db:up), or rely on the CI dup-number gate to",
      "    catch a collision before merge (it will fail the PR; just bump the number).",
    );
  }
  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      `open ${rel}`,
      ...(reserved ? [] : ['pnpm db:up   then   storytree adr next --pg   (reserve atomically next time)']),
    ],
  };
}

async function adrNext(deps: AdrCommandDeps): Promise<Envelope> {
  const localMax = maxAdrNumber(deps.decisionsDir);
  if (!deps.allocator) {
    return {
      ok: false,
      body:
        `${pad(localMax + 1)}  — OFFLINE peek (max-on-disk + 1), NOT reserved.\n` +
        "another session could take it. Run with --pg (after pnpm db:up) to reserve it atomically.",
      next: ["pnpm db:up", "storytree adr next --pg"],
    };
  }
  try {
    const r = await deps.allocator.allocate({
      localMax,
      slug: "(reserved via adr next)",
      branch: deps.branch,
      actor: deps.actor,
    });
    return {
      ok: true,
      body: `ADR-${pad(r.number)} reserved. Author docs/decisions/${pad(r.number)}-<slug>.md (or use \`adr new --title\`).`,
      next: ['storytree adr new --title "..." --pg'],
    };
  } catch (e) {
    return {
      ok: false,
      body: `couldn't reserve an ADR number from the DB: ${(e as Error).message}`,
      next: ["pnpm db:up", "storytree adr next --pg"],
    };
  }
}

// ---------------------------------------------------------------------------
// `storytree adr list` — the SEARCHABLE current-state view (ADR-0086, directive A)
// ---------------------------------------------------------------------------
//
// Replaces the hand-maintained `CLAUDE.md` "Load-bearing ADRs" + "reversals" sections with a query
// derived from the live frontmatter, so the list can never drift from the files. Two cuts:
//   --current        every accepted, non-superseded ADR (the derived backbone — honest by construction)
//   --load-bearing   only the curated `load_bearing: true` set (the editorial calibrate-to-these list)
// Outgoing edges (supersedes / amends — binary since ADR-0139 retired supersedes-in-part) and the
// derived `superseded by` back-edge are shown inline so the reversal story reads off the graph, not off
// prose. Read-only + offline (it reads docs/decisions on disk) — no DB, no API key.

/** A parsed ADR for the `list` view: frontmatter meta + the H1 title. */
export interface AdrListing {
  meta: AdrMeta;
  title: string;
}

/** The `adr list` filters; absent = no filter (show everything). */
export interface AdrListFilter {
  current?: boolean;
  loadBearing?: boolean;
  status?: AdrStatus;
}

/** PURE: the text after `# ADR-NNNN:` (the decision's H1 title); "" when there is no such heading. */
export function extractAdrTitle(content: string): string {
  const m = /^#\s+ADR-\d{4}:\s*(.+?)\s*$/m.exec(content);
  return m && m[1] !== undefined ? m[1] : "";
}

/**
 * PURE: filter + format the listing rows. Derived `superseded by` back-edges are computed from the
 * FULL set (before the display filter), so a row's reversal is shown even when the superseding ADR is
 * filtered out of view. `★` marks a `load_bearing` current-state ADR.
 */
export function renderAdrList(listings: readonly AdrListing[], filter: AdrListFilter): string[] {
  const supersededBy = new Map<number, number[]>();
  for (const l of listings) {
    for (const t of l.meta.supersedes) {
      const arr = supersededBy.get(t) ?? [];
      arr.push(l.meta.number);
      supersededBy.set(t, arr);
    }
  }
  const sorted = [...listings].sort((a, b) => a.meta.number - b.meta.number);
  const rows: string[] = [];
  for (const l of sorted) {
    const m = l.meta;
    if (filter.current === true && m.status !== "accepted") continue;
    if (filter.loadBearing === true && !m.loadBearing) continue;
    if (filter.status !== undefined && m.status !== filter.status) continue;
    rows.push(`${m.loadBearing ? "★" : " "} ${pad(m.number)}  ${m.status.padEnd(10)} ${l.title}`);
    const edges: string[] = [];
    if (m.supersedes.length > 0) edges.push(`supersedes ${m.supersedes.map(pad).join(", ")}`);
    if (m.amends.length > 0) edges.push(`amends ${m.amends.map(pad).join(", ")}`);
    if (m.arc !== undefined) edges.push(`arc ${m.arc}`);
    const back = supersededBy.get(m.number);
    if (back !== undefined && back.length > 0) edges.push(`superseded by ${back.map(pad).join(", ")}`);
    for (const e of edges) rows.push(`            ${e}`);
  }
  return rows;
}

/** Read + parse every `NNNN-*.md` in the decisions dir into a listing; parse failures are collected. */
export function loadAdrListings(decisionsDir: string): {
  listings: AdrListing[];
  parseErrors: string[];
} {
  const listings: AdrListing[] = [];
  const parseErrors: string[] = [];
  let files: string[];
  try {
    files = readdirSync(decisionsDir).sort();
  } catch {
    return { listings, parseErrors };
  }
  for (const file of files) {
    if (!/^\d{4}-.*\.md$/.test(file)) continue;
    try {
      const content = readFileSync(path.join(decisionsDir, file), "utf8");
      listings.push({ meta: parseAdrFrontmatter(file, content), title: extractAdrTitle(content) || file });
    } catch (err) {
      parseErrors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { listings, parseErrors };
}

const STATUS_WORDS: ReadonlySet<string> = new Set(["proposed", "accepted", "superseded"]);

function adrList(opts: AdrCommandOpts, deps: AdrCommandDeps): Envelope {
  if (opts.status !== undefined && !STATUS_WORDS.has(opts.status)) {
    return {
      ok: false,
      body: `unknown --status "${opts.status}". use one of: proposed, accepted, superseded.`,
      next: ["storytree adr list --current", "storytree adr list --load-bearing"],
    };
  }
  const { listings, parseErrors } = loadAdrListings(deps.decisionsDir);
  if (listings.length === 0) {
    return {
      ok: false,
      body:
        parseErrors.length > 0
          ? `no ADRs parsed:\n${parseErrors.join("\n")}`
          : "no ADRs found in the decisions dir.",
      next: ['storytree adr new --title "..." --pg'],
    };
  }
  const filter: AdrListFilter = {
    ...(opts.current === true ? { current: true } : {}),
    ...(opts.loadBearing === true ? { loadBearing: true } : {}),
    ...(opts.status !== undefined ? { status: opts.status as AdrStatus } : {}),
  };
  const rows = renderAdrList(listings, filter);
  const cut = opts.loadBearing
    ? "load-bearing current-state"
    : opts.current
      ? "current (accepted, not superseded)"
      : opts.status !== undefined
        ? opts.status
        : "all";
  const lines = [
    `storytree adr — ${rows.filter((r) => !r.startsWith(" ".repeat(12))).length} ADRs [${cut}]   ★ = load-bearing`,
    "",
    ...(rows.length > 0 ? rows : ["  (none match)"]),
  ];
  if (parseErrors.length > 0) {
    lines.push("", `⚠️  ${parseErrors.length} file(s) failed to parse:`, ...parseErrors.map((e) => `  ${e}`));
  }
  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      "storytree adr list --load-bearing   (the calibrate-to-these set)",
      "storytree adr list --current        (every accepted, non-superseded ADR)",
    ],
  };
}

export function adrHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree adr — search the decision log + allocate ADR numbers without collisions (ADR-0050/0086).",
      "",
      "  storytree adr list [--current | --load-bearing | --status <s>]   the searchable current-state view",
      '  storytree adr new --title "..." [--decided] [--supersedes 42] [--amends 42,43] [--arc <id>] --pg   reserve + scaffold',
      "  storytree adr next --pg                                                  reserve a number only",
      "",
      "  --decided   the owner DIRECTED this in conversation → scaffold born `accepted` + `decided: <today>`",
      "              (design-time alignment IS ratification, no second end-of-flow ask; ADR-0110). Omit it",
      "              for the born-`proposed` default of a still-thinking ADR.",
      "  --arc <id>  the ADR-0183 D3 provenance stamp: the Library `arc` this decision was produced under.",
      "              Immutable once scaffolded; the arc's ADR view derives from these child stamps",
      "              (storytree arc show <id>). Omit for arc-less work.",
      "",
      "`list` is read-only + offline (it reads docs/decisions on disk):",
      "  --current        every accepted, non-superseded ADR (the derived backbone)",
      "  --load-bearing   the curated calibrate-to-these set (★, the CLAUDE.md list, now live)",
      "  --status <s>     filter to proposed | accepted | superseded",
      "",
      "writes need --pg (bring the DB up first: pnpm db:up). Offline new/next fall back to max+1 with a",
      "loud warning that the number is NOT reserved — the CI dup-number gate is the backstop.",
    ].join("\n"),
    next: ["storytree adr list --load-bearing", 'storytree adr new --title "..." --pg'],
  };
}

/** Dispatch the `adr` area: `new` (reserve + scaffold) | `next` (reserve only) | help. */
export async function adrCommand(
  sub: string | undefined,
  opts: AdrCommandOpts,
  deps: AdrCommandDeps,
): Promise<Envelope> {
  if (sub === undefined || sub === "help") return adrHelp();
  if (sub === "list") return adrList(opts, deps);
  if (sub === "new") return adrNew(opts, deps);
  if (sub === "next") return adrNext(deps);
  return {
    ok: false,
    body: `unknown adr command "${sub}". try: storytree adr list  |  storytree adr new --title "..." --pg`,
    next: ["storytree adr list --load-bearing", 'storytree adr new --title "..." --pg'],
  };
}
