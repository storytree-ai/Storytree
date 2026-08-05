/**
 * `check:surface-coverage` — the process↔entrypoint bijection sweep (ADR-0154 decision 2).
 *
 * ADR-0034 §2 makes a `process` artifact the derived, operational view of a way-of-working; ADR-0154
 * makes the CLI/pnpm surface a declared PROJECTION of that process tier and gates it on coverage
 * (never on necessity). This is that gate: a best-effort, WARN-only sweep — the contract↔test
 * (`check:coverage`) / seed↔live (`check:corpus-sync`) analogue — that computes the bijection
 *
 *   (a) every entrypoint a process NAMES in its `surfaces` resolves to a real entrypoint, and
 *   (b) every operator-facing entrypoint has SOME process behind it (else it is an orphan),
 *
 * and prints both gaps. "Which commands do we need?" is a judgement the gate must not adjudicate — it
 * only asserts the bijection holds over what exists. The orphan list IS the process-tier backfill
 * worklist.
 *
 * BOUNDED AT A DRAIN CEILING since 2026-07-27 (`verification-integrity-arc`, ADR-0252 D3, in ADR-0168
 * D4's shape). It was WARN-only and exited 0 at every gap count — so when ADR-0195 added the
 * `ci:affected` script with no process behind it, the bijection broke on `main` and stayed broken for
 * thirteen days without failing anything. The ceiling itself, the measured evidence, and both axes'
 * baselines live in `surface-coverage-drain.ts`; this module is unchanged in what it COMPUTES, and the
 * OK/WARN levels below are unchanged — RED is layered above them by the thin shell.
 *
 * ─── The `surfaces`-names-an-entrypoint convention (ADR-0154 left the grammar to this unit) ───
 * A `process`'s `surfaces` prose names each enacting entrypoint as a BACKTICK span. A span is read as
 * an entrypoint reference when it is one of:
 *   • `` `storytree <area> …` `` (also `` `pnpm storytree <area> …` ``) → the CLI area `storytree <area>`
 *       (resolved at AREA granularity — trailing sub-verbs/flags are ignored).
 *   • `` `pnpm <script> …` `` → the root script `pnpm <script>` (first token after `pnpm`).
 *   • `` `pnpm --filter <app> <script> …` `` → the per-app script `pnpm --filter <app> <script>`.
 *   • a LENIENT bare `` `<script>` `` span that EXACTLY equals a known root script name (e.g.
 *       `` `studio:up` ``) → `pnpm <script>`. Script names are distinctive tokens, so this is
 *       unambiguous; a bare AREA name (a common English word) is NOT recognised — areas need the
 *       explicit `storytree` prefix.
 * Every other backtick span (file paths, table/CI words, flags like `--pg`) is ordinary prose and
 * ignored. So the six existing agent-ceremony processes — whose `surfaces` name no launcher — simply
 * contribute no refs, and the operational launchers Unit-3 backfills will name theirs canonically.
 *
 * The gate reads the LIVE store for its `process` tier (ADR-0302 D1). It read the committed seed
 * until that decision, which made it DB-free but also made it judge a MIRROR: a process authored
 * live lagged here until an export ceremony ran, and those ceremonies are deleted (ADR-0302 D4). It
 * still runs identically local + CI — CI now holds the credential (ADR-0302 D3) — and the
 * entrypoints half is still pure disk (`package.json`), so only the process half moved.
 *
 * Pure-by-injection: {@link parseSurfaceRefs} / {@link classifySurfaceCoverage} /
 * {@link formatSurfaceCoverage} are deterministic over their inputs (offline-testable with fixtures);
 * {@link loadSurfaceCoverageInputs} is the only I/O, and the thin `check-surface-coverage.ts`
 * entrypoint is the only place that runs the sweep, prints, and exits 0.
 */

import { readFileSync } from "node:fs";

import type { Store } from "@storytree/storage-protocol";

import { CLI_AREAS } from "./cli-areas.js";

const TAG = "[check:surface-coverage]";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which surface namespace an entrypoint lives in (only for reporting/grouping). */
export type EntrypointNamespace = "cli" | "pnpm" | "pnpm-app";

/** One enumerated operator surface. `id` is the canonical form a `surfaces` ref normalises to. */
export interface Entrypoint {
  /** Canonical id: `storytree <area>` | `pnpm <script>` | `pnpm --filter <app> <script>`. */
  id: string;
  /** The namespace it came from (reporting only). */
  namespace: EntrypointNamespace;
  /**
   * Whether it participates in orphan detection (b). CLI areas are enumerated as RESOLUTION targets
   * for (a) but are NOT orphan-checked in this first cut — deriving the command STRUCTURE from the
   * process graph (every area traces to a process) is the ADR-0154 deferred `next:`-graph follow-on.
   * Internal gate/generator scripts (`check:*`, `build:*`, `sync:*`, the raw `-r` dev verbs) are
   * mechanics of the gate/merge ceremony, not standalone ways-of-working, so they are excluded too.
   */
  orphanChecked: boolean;
}

/** A process's parsed surface refs (its `surfaces` prose already reduced to canonical entrypoint ids). */
export interface ProcessSurfaces {
  /** The process artifact id. */
  id: string;
  /** Canonical entrypoint refs named in its `surfaces` field (deduped, in first-seen order). */
  refs: string[];
}

/** A named surface that resolves to no real entrypoint — a fix-the-ref-or-add-the-entrypoint gap. */
export interface UnresolvedSurface {
  processId: string;
  ref: string;
}

/** The whole sweep result. */
export interface SurfaceCoverageReport {
  /** (a) named surfaces resolving to no entrypoint, in scan order. */
  unresolved: UnresolvedSurface[];
  /** (b) orphan-checked entrypoints named by no process — the backfill worklist, in enum order. */
  orphans: string[];
  /** How many processes were scanned. */
  processCount: number;
  /** How many entrypoints were enumerated. */
  entrypointCount: number;
  /** True iff both gaps are empty. */
  clean: boolean;
}

// ---------------------------------------------------------------------------
// Pure parse: `surfaces` prose → canonical entrypoint refs
// ---------------------------------------------------------------------------

const BACKTICK_SPAN = /`([^`]+)`/g;

/**
 * PURE: extract the canonical entrypoint refs a process's `surfaces` prose names, per the convention
 * documented in this file's header. `knownScripts` enables the lenient bare-script-token form (a
 * backtick span that is exactly a known root script name); omit it to recognise only the explicit
 * `storytree …` / `pnpm …` prefixed forms. Deterministic; deduped in first-seen order.
 */
export function parseSurfaceRefs(prose: string, knownScripts: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string): void => {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };

  for (const m of prose.matchAll(BACKTICK_SPAN)) {
    const span = (m[1] ?? "").trim();
    if (span === "") continue;
    let toks = span.split(/\s+/).filter((t) => t !== "");
    if (toks.length === 0) continue;

    // `pnpm storytree <area> …` is a CLI-area ref — drop the pnpm forwarder so the two forms unify.
    if (toks[0] === "pnpm" && toks[1] === "storytree") toks = toks.slice(1);

    if (toks[0] === "storytree") {
      const area = toks[1];
      // A `storytree <area>` ref resolves at area granularity; a bare `storytree` or `storytree --flag`
      // names no area, so it is not a ref. An unknown area is still emitted → flagged unresolved.
      if (area !== undefined && !area.startsWith("-")) push(`storytree ${area}`);
      continue;
    }

    if (toks[0] === "pnpm") {
      if (toks[1] === "--filter") {
        const app = toks[2];
        const script = toks[3];
        if (app !== undefined && script !== undefined) push(`pnpm --filter ${app} ${script}`);
      } else if (toks[1] !== undefined && !toks[1].startsWith("-")) {
        push(`pnpm ${toks[1]}`);
      }
      continue;
    }

    // Lenient bare form: a single-token span that is EXACTLY a known root script (e.g. `studio:up`).
    const only = toks[0];
    if (toks.length === 1 && only !== undefined && knownScripts.has(only)) push(`pnpm ${only}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pure classify + format
// ---------------------------------------------------------------------------

/**
 * PURE: compute the bijection. (a) a process ref not in the enumerated entrypoint id set is
 * `unresolved`; (b) an `orphanChecked` entrypoint named by no process is an `orphan`. Deterministic
 * and order-preserving.
 */
export function classifySurfaceCoverage(input: {
  processes: readonly ProcessSurfaces[];
  entrypoints: readonly Entrypoint[];
}): SurfaceCoverageReport {
  const validIds = new Set(input.entrypoints.map((e) => e.id));
  const named = new Set<string>();
  const unresolved: UnresolvedSurface[] = [];

  for (const p of input.processes) {
    for (const ref of p.refs) {
      if (validIds.has(ref)) named.add(ref);
      else unresolved.push({ processId: p.id, ref });
    }
  }

  const orphans = input.entrypoints.filter((e) => e.orphanChecked && !named.has(e.id)).map((e) => e.id);

  return {
    unresolved,
    orphans,
    processCount: input.processes.length,
    entrypointCount: input.entrypoints.length,
    clean: unresolved.length === 0 && orphans.length === 0,
  };
}

/**
 * PURE: render the sweep as console lines + a `warn` flag. WARN names both gap lists (the backfill
 * worklist); OK reports the covered counts. NEVER throws or exits — the caller prints, then applies
 * the drain ceiling (`surface-coverage-drain.ts`) to decide the exit code. These two levels are
 * UNCHANGED by that ceiling: RED is layered above them, never a band opened beneath.
 */
export function formatSurfaceCoverage(report: SurfaceCoverageReport): { warn: boolean; lines: string[] } {
  if (report.clean) {
    return {
      warn: false,
      lines: [
        `${TAG} OK — every process names a real entrypoint and every operator-facing entrypoint has a ` +
          `process (${report.processCount} processes, ${report.entrypointCount} entrypoints).`,
      ],
    };
  }
  const lines = [
    `${TAG} WARN — the process↔entrypoint bijection has gaps (ADR-0154). This is the process-tier ` +
      "backfill worklist; it reds the gate above its drain ceiling (surface-coverage-drain.ts).",
  ];
  if (report.unresolved.length > 0) {
    lines.push(
      `${TAG}   ${report.unresolved.length} named surface(s) resolve to NO entrypoint ` +
        "(fix the `surfaces` ref, or add the entrypoint):",
    );
    for (const u of report.unresolved) lines.push(`${TAG}     ${u.processId} → "${u.ref}"`);
  }
  if (report.orphans.length > 0) {
    lines.push(
      `${TAG}   ${report.orphans.length} operator-facing entrypoint(s) have NO process ` +
        "(author a `process` deriving from its ADR, or retire the entrypoint):",
    );
    for (const o of report.orphans) lines.push(`${TAG}     ${o}`);
  }
  return { warn: true, lines };
}

// ---------------------------------------------------------------------------
// Injectable runner (the input loader is the seam)
// ---------------------------------------------------------------------------

/** Everything the runner reads, injected for offline testability (the disk loader is the seam). */
export interface SurfaceCoverageDeps {
  loadInputs: () => Promise<{ processes: ProcessSurfaces[]; entrypoints: Entrypoint[] }>;
}

/**
 * The injectable gate runner: load → classify → format. Pure-by-injection. The classified `report` is
 * returned alongside the rendered lines so the shell can apply the drain ceiling to the same sweep
 * without re-running it (`surface-coverage-drain.ts`).
 */
export async function runSurfaceCoverageGate(deps: SurfaceCoverageDeps): Promise<{
  warn: boolean;
  lines: string[];
  report: SurfaceCoverageReport;
}> {
  const report = classifySurfaceCoverage(await deps.loadInputs());
  return { ...formatSurfaceCoverage(report), report };
}

// ---------------------------------------------------------------------------
// Entrypoint enumeration (the operator-facing surface set)
// ---------------------------------------------------------------------------

/**
 * The operator-facing per-app launchers (ADR-0154): scripts an operator/agent runs to LAUNCH an app,
 * discoverable only via `pnpm --filter`. Kept as a small documented allow-list (not every per-app
 * script — most are internal); a launcher process names one of these in its `surfaces`.
 */
export const PER_APP_ENTRYPOINTS: readonly { app: string; script: string }[] = [
  { app: "studio", script: "dev" }, // ADR-0042 launch-studio (the Vite dev server)
  { app: "desktop", script: "start" }, // ADR-0109/0111 launch-desktop (the Electron client — the originating drift)
];

/**
 * PURE: is a root script INTERNAL — a mechanic of the gate/merge ceremony rather than a standalone
 * way-of-working? Such scripts are enumerated (so a process MAY still name them) but are not
 * orphan-checked, keeping the orphan worklist to real operator launchers. The `storytree` forwarder is
 * excluded because the CLI is represented by its AREAS instead (`storytree <area>`).
 */
export function isInternalScript(name: string): boolean {
  return (
    name.startsWith("check:") || // gate verification steps
    name.startsWith("build:") || // generators the gate runs
    name.startsWith("sync:") || // web-engine sync (gate/CD mechanic)
    name === "storytree" || // the CLI forwarder — represented by the CLI areas
    name === "build" ||
    name === "typecheck" ||
    name === "test" || // the `-r` dev/CI verbs (mechanics of the gate/merge ceremony)
    name === "sync" // the `git rebase origin/main` shortcut
  );
}

/**
 * PURE: enumerate every entrypoint from the CLI areas + the root `package.json` script names + the
 * per-app allow-list. CLI areas are resolution targets only (not orphan-checked — the deferred
 * `next:`-graph follow-on); operator-facing scripts + per-app launchers are orphan-checked.
 */
export function enumerateEntrypoints(scriptNames: readonly string[]): Entrypoint[] {
  const eps: Entrypoint[] = [];
  for (const area of CLI_AREAS) {
    eps.push({ id: `storytree ${area}`, namespace: "cli", orphanChecked: false });
  }
  for (const s of scriptNames) {
    eps.push({ id: `pnpm ${s}`, namespace: "pnpm", orphanChecked: !isInternalScript(s) });
  }
  for (const { app, script } of PER_APP_ENTRYPOINTS) {
    eps.push({ id: `pnpm --filter ${app} ${script}`, namespace: "pnpm-app", orphanChecked: true });
  }
  return eps;
}

// ---------------------------------------------------------------------------
// Disk enumeration (parameterized I/O — the production `loadInputs`)
// ---------------------------------------------------------------------------

/** The `process` fields this gate reads off a stored library doc. */
interface ProcessDocLike {
  surfaces?: unknown;
}

/**
 * Load the gate inputs: the operator entrypoints from `package.json` (+ CLI areas + per-app
 * allow-list) — pure disk — and the process refs from the LIVE store (ADR-0302 D1; it read the
 * committed seed until that decision). The `package.json` path is injected so the thin entrypoint
 * resolves it against the repo root; the store is injected so this stays testable without a DB.
 */
export async function loadSurfaceCoverageInputs(opts: {
  store: Store;
  packageJsonPath: string;
}): Promise<{ processes: ProcessSurfaces[]; entrypoints: Entrypoint[] }> {
  const pkg = JSON.parse(readFileSync(opts.packageJsonPath, "utf8")) as { scripts?: Record<string, string> };
  const scriptNames = Object.keys(pkg.scripts ?? {});
  const knownScripts = new Set(scriptNames);
  const entrypoints = enumerateEntrypoints(scriptNames);

  const processes: ProcessSurfaces[] = [];
  for (const d of await opts.store.queryDocs({ kind: "process" })) {
    const doc = d.doc as ProcessDocLike;
    const surfaces = typeof doc.surfaces === "string" ? doc.surfaces : "";
    processes.push({ id: d.id, refs: parseSurfaceRefs(surfaces, knownScripts) });
  }
  return { processes, entrypoints };
}
