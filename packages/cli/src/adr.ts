import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

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
}

export interface AdrCommandOpts {
  title?: string | undefined;
  supersedes?: string | undefined;
  amends?: string | undefined;
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

/** PURE: the scaffold body for a fresh (proposed) ADR — frontmatter + H1 + the standard sections. */
export function scaffold(
  n: number,
  title: string,
  edges: { supersedes: number[]; amends: number[] },
): string {
  const fm = ["---", "status: proposed"];
  if (edges.supersedes.length > 0) fm.push(`supersedes: [${edges.supersedes.join(", ")}]`);
  if (edges.amends.length > 0) fm.push(`amends: [${edges.amends.join(", ")}]`);
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
  const body = [
    `# ADR-${pad(n)}: ${title}`,
    "",
    "## Status",
    "",
    "proposed — <one line: who decided / when / why>.",
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
  writeFileSync(file, scaffold(n, title, edges), "utf8");

  const rel = displayPath(deps.decisionsDir, base);
  const lines = [
    `ADR-${pad(n)} ${reserved ? "reserved in the DB" : "allocated OFFLINE (max+1)"} → ${rel}`,
    "",
    `# ADR-${pad(n)}: ${title}`,
    "Scaffolded with proposed status — fill in Status / Context / Decision / Consequences, then commit.",
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

export function adrHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree adr — allocate ADR numbers from the live store so parallel sessions never collide (ADR-0050).",
      "",
      '  storytree adr new --title "..." [--supersedes 42] [--amends 42,43] --pg   reserve + scaffold the file',
      "  storytree adr next --pg                                                  reserve a number only",
      "",
      "writes need --pg (bring the DB up first: pnpm db:up). Offline both fall back to max+1 with a loud",
      "warning that the number is NOT reserved — the CI dup-number gate is the backstop for that case.",
    ].join("\n"),
    next: ["pnpm db:up", 'storytree adr new --title "..." --pg'],
  };
}

/** Dispatch the `adr` area: `new` (reserve + scaffold) | `next` (reserve only) | help. */
export async function adrCommand(
  sub: string | undefined,
  opts: AdrCommandOpts,
  deps: AdrCommandDeps,
): Promise<Envelope> {
  if (sub === undefined || sub === "help") return adrHelp();
  if (sub === "new") return adrNew(opts, deps);
  if (sub === "next") return adrNext(deps);
  return {
    ok: false,
    body: `unknown adr command "${sub}". try: storytree adr new --title "..." --pg`,
    next: ['storytree adr new --title "..." --pg', "storytree adr next --pg"],
  };
}
