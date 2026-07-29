/**
 * `pnpm check:verification-decay` — the continuous mechanical half of the verification-decay
 * detection pass (ADR-0252, `verification-integrity-arc`). The thin disk-reading entrypoint: it
 * enumerates the facts, hands them to the pure judge in {@link file://./verification-decay.ts}, and
 * prints. Every RULE lives in the judge; nothing here decides anything.
 *
 * Wired into `pnpm gate` alongside `check:coverage` / `check:friction-drain` / `check:corpus-sync`,
 * and deliberately NOT into CI. It is OFFLINE and READ-ONLY — pure file reads, no store, no network —
 * so unlike `check:friction-drain` it never SKIPs for want of a DB and COULD run in CI. It does not,
 * for the reason ADR-0252 D3 turns on: these are heuristics, and a CI step is a merge barrier. The
 * ceiling is a DRAIN OBLIGATION on the session, the `check:friction-drain` shape (ADR-0168 D4), not a
 * gate on the trunk. THE ACCEPTED COST, stated rather than glossed: a landing that never runs the
 * local gate can grow the backlog unseen.
 *
 * NOT DONE HERE, so nobody reads this as complete:
 *
 * - ADR-0252 names FOUR cheap instruments and **all four now sweep** — the registry below is the seam
 *   that made each a row rather than a redesign. Chartered coverage is REPORTED on every run rather
 *   than asserted here, so this comment can never be the thing that goes stale about it.
 * - ADR-0252 D1's **warn-escalation backstop** EXISTS, with exactly ONE line declared: an instrument
 *   that FAILED TO RUN (the sweep went blind). It reds the gate independently of the ceiling and
 *   demands the fresh-session adversarial pass. The two DEFERRAL-KEYED lines — a signal's AGE, and a
 *   count of arc-closes that declined the pass — are **decided against, not deferred** (ADR-0256): both
 *   fire only on a record written to TRIGGER them, and a trigger-record is fail-OPEN, because the party
 *   that must write it is the party the backstop fences. This line stays the only one because a blind
 *   instrument is observed by the sweep, about itself, in the same run — there is no input to omit.
 *   Do not re-open this as unbuilt work; ADR-0256 names what would change the answer.
 *   THE RESIDUAL IS THEREFORE PERMANENT AND OWNER-FACING: the skip risk is covered for the
 *   blind-instrument class only, and a signal that merely sits unexamined escalates nothing.
 * - `mirror-pair-drift` locates unregistered pairs; it does NOT repair any. Registering a pair means
 *   authoring a probe on each surface and a `MIRRORS` row, which is a separate increment per payload.
 * - `vacuous-proof` locates options-form-skipped tests; it repairs none, and it does NOT close the
 *   underlying gap. The one-line fix — teach ADR-0126's `analyzeObservedTests` to parse the options
 *   form — is still a call about the WORK rather than about this sweep, but its cost is no longer
 *   unmeasured: it moves exactly ONE contract into `check:coverage`'s backlog
 *   (`release-claims-by-branch-clears-the-branch`), because only one of the 7 located files is a
 *   scanned capability's registered `real.testFile`. `coverage-drain.ts` records that number as the
 *   one sanctioned re-baseline of its ceiling. (This bullet read "it would move every contract those
 *   tests vouch for" until 2026-07-28; that estimate was never measured and it deferred bounding
 *   `check:coverage` behind three other increments. ADR-0126 carries the same correction.)
 * - `warn-list-hygiene` locates advisory worklists that no exit code bounds, and ALL SIX are now
 *   bounded — `check:graduation-worklist` (`graduation-drain.ts`), `check:surface-coverage`
 *   (`surface-coverage-drain.ts`), `check:corpus-content` (`corpus-content-drain.ts`), `check:coverage`
 *   (`coverage-drain.ts`) and the `sync` pair `check:agents-sync` / `check:corpus-sync`
 *   (`sync-drain.ts`) — so this instrument locates nothing and its ceiling is 0. Read that as DRAINED,
 *   not as switched off: it still sweeps every `check:*` step in `pnpm gate` on every run, and a new
 *   advisory worklist that no exit code bounds reds the gate the first time it appears. Whether a given
 *   worklist needs a ceiling stays a per-check decision about that check's REMEDY, made against that
 *   check's real output; this sweep reads source and cannot see a list's size, so it can never make the
 *   call itself. (This bullet read "the other TWO are not" until 2026-07-28.)
 *
 * On mirror-pair drift specifically, note the boundary ADR-0251 records: `check:mirror-conformance`
 * already proves the pairs in its `MIRRORS` registry EXACTLY, and blocks. The advisory instrument
 * here is the discovery heuristic — finding mirrored pairs MISSING from that registry — never a
 * re-derivation of what the registry already proves.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractVouchingTestNames, loadNodeSpec } from "@storytree/orchestrator";

import { registeredMirrorRoutes } from "./mirror-conformance.js";
import {
  CONTRACT_BINDING_DRIFT,
  MIRROR_PAIR_DRIFT,
  VACUOUS_PROOF,
  WARN_LIST_HYGIENE,
  findContractBindingDrift,
  findMirrorPairDrift,
  findOptionsFormSkips,
  findVacuousProof,
  findWarnListHygiene,
  formatDecaySweep,
  requireObserved,
  runDecaySweep,
  type BoundTarget,
  type DecayInstrument,
  type GateCheckFacts,
  type GateCheckSource,
  type ProofBinding,
  type SurfaceRoutes,
  type TestFileFacts,
  type WorkspaceFacts,
} from "./verification-decay.js";

// This file sits at packages/cli/src/ — three levels up is the repo root.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * THE DRAIN CEILINGS (ADR-0252 D3) — one per instrument, each tuned on THAT instrument's first real
 * sweep rather than picked in advance. See {@link evaluateDecayCeiling} for why the ceiling is
 * per-instrument: under one shared total, every new instrument arrives carrying its honest baseline
 * as growth and reds the gate on landing, which pays a session to weaken the instrument instead of
 * building it — and unrelated backlogs become fungible, so repairing a stale binding buys silence for
 * an unobserved mirror pair.
 *
 * Each starts GREEN on an honest baseline and can only ever be tightened: repair a signal, lower that
 * instrument's number. RAISING one is a deliberate act, and the reason belongs in the commit message.
 */
const CEILINGS = {
  /**
   * Baselined 2026-07-27 at the 5 signals that sweep located — every one of them a unit bound to
   * `@storytree/core` (dissolved by ADR-0068) or `@storytree/store` (dissolved by ADR-0077).
   * Unchanged since: no binding has been repaired.
   */
  [CONTRACT_BINDING_DRIFT]: 5,
  /**
   * Baselined 2026-07-27 at the 10 route pairs that sweep located — every `/api/*` path served by
   * BOTH the studio server and the desktop backend except `/api/docs`, the one pair `MIRRORS`
   * registers. Register a pair (a probe on each surface plus a row), lower this number.
   *
   * RE-BASELINED 10 → 11 (2026-07-29), and the direction is the point: this is the ONE legitimate
   * upward move `asset:verification-decay-detection` names — an instrument whose MEASURED POPULATION
   * genuinely enlarges is re-baselined on the first real sweep of that new population, with the
   * reason recorded AT the number. THE TELL THAT SEPARATES IT FROM GAMING IS THAT **WHAT** IS
   * COUNTED CHANGED, NOT MERELY **HOW MANY**: no pair was reclassified, no finding was excused, and
   * the ceiling did not move to accommodate a backlog that grew under it. `MIRROR_SURFACE` walked
   * only `apps/desktop/src/backend` and never `apps/desktop/electron`, so two routes the desktop
   * genuinely serves — `/api/attestations` and `/api/uat/attest`, both mounted in
   * `electron/backend-entry.ts`, the first of them self-documented there as re-composing the studio
   * payload with no studio import — had never entered the count at all. The instrument was sitting at
   * a ceiling of ten while its real population was eleven: a guard measuring a smaller world than the
   * one it guards.
   *
   * MEASURED, not predicted, and the two effects were isolated deliberately so the number is
   * attributable rather than a net figure nobody can decompose:
   *   10  the standing baseline
   *   −1  `/api/activity` REGISTERED — a real repair (probe pair + `MIRRORS` row), and the first
   *       drain this instrument has ever recorded; measured alone, before the sweep widened
   *   +2  `/api/attestations`, `/api/uat/attest` — newly VISIBLE, not newly broken; unobserved on
   *       every day this instrument reported a complete sweep
   *   =11 the first real sweep of the enlarged population
   *
   * A DRAIN AND A DISCOVERY ARE NOT INTERCHANGEABLE, which is why they are not netted here.
   * `check:mirror-conformance` is a BLOCKING gate step; this instrument is advisory and deliberately
   * excluded from CI. So the −1 actually FENCES a route — a divergence in `/api/activity` now reds a
   * gate — while the +2 only makes two long-standing unobserved pairs visible. Widening the sweep
   * bought discovery, not enforcement; only a `MIRRORS` row buys enforcement.
   */
  [MIRROR_PAIR_DRIFT]: 11,
  /**
   * Baselined 2026-07-27 at the 7 test FILES that sweep located across 424 test files and 4043
   * observed tests — each holding one or more options-form-skipped tests the repo's own classifier
   * reports as running and asserting. Make a file's skip VISIBLE (the `store.test.ts` idiom), lower
   * this number.
   */
  [VACUOUS_PROOF]: 7,
  /**
   * Baselined 2026-07-27 at the 6 advisory gate checks that sweep located across the 21 `check:*`
   * steps `pnpm gate` runs — each printing a per-item WARN worklist that no exit code bounds. Bound a
   * worklist (a ceiling compared against its count, the `check:friction-drain` shape), or establish
   * that one cannot accumulate, and lower this number.
   *
   * TIGHTENED 6 → 5 on the same day: `check:graduation-worklist` was bounded at a drain ceiling
   * (`graduation-drain.ts`), so the sweep no longer locates it. It was the right one to bound first
   * because it is not a hypothetical — ADR-0168 D4 cites THIS queue as the measured rot that justified
   * the friction ceiling ("grew 31→58 in one session and drained nothing"), then bounded the sibling
   * and left this one WARN-only.
   *
   * TIGHTENED 5 → 4 (2026-07-27): `check:surface-coverage` was bounded at a two-axis drain ceiling
   * (`surface-coverage-drain.ts`). Its rot was measured the same way — a differential control over the
   * real gate code with only its inputs varied showed the sweep CLEAN at `bedf6dba^`, then `orphans=1`
   * the moment ADR-0195 added `ci:affected` with no process behind it, and still 1 thirteen days later.
   * A WARN-backed worklist that no exit code bounds does not get drained.
   *
   * TIGHTENED 4 → 3 (2026-07-28): `check:corpus-content` was bounded at a two-axis drain ceiling
   * (`corpus-content-drain.ts`). It was the right one to bound next because it is the only remaining
   * located worklist that demonstrably ACCUMULATES — the two `sync` checks read 0 today and drain on
   * one idempotent command, and `check:coverage` carries a known conflict. Its rot was measured the
   * same way: a differential control over the real binary with only its seed input varied found it
   * printing a 122-item worklist and exiting 0 on the very day the check landed, then wandering
   * 18 → 14 → 16 → 14 over the next month with nothing ever failing. Its two axes are ADR-0120's own
   * classification, and a control against the live store showed why they may not be summed — draining
   * one value-drift while one body degrades leaves the sum at exactly 14 while a schema-floor fault
   * appears.
   *
   * TIGHTENED 3 → 2 (2026-07-28): `check:coverage` was bounded at a two-axis drain ceiling
   * (`coverage-drain.ts`) — the list ADR-0252 itself names as this instrument's live counter-example.
   * Its rot was measured the same way, a differential control over the real binary with only its
   * inputs varied (`stories/**` and the test files they bind, replayed from git while the check code
   * stayed pinned at HEAD): 66 unproven contracts on the day the check landed, 121 a month later,
   * exit 0 at all nine sampled points. It is the only bounded worklist in this arc whose measured
   * history is MONOTONE growth. The known classifier conflict was measured rather than feared —
   * teaching `analyzeObservedTests` the options form moves the backlog by exactly +1 contract, which
   * `coverage-drain.ts` records at the number as the one sanctioned re-baseline. Its two axes had to
   * be earned rather than inherited, and its substrate guard points BOTH ways: an absent spec corpus
   * deflates to a false clean, an absent test-file tree inflates — so neither sibling's direction was
   * copied.
   *
   * TIGHTENED 2 → 0 (2026-07-28): the `sync` pair — `check:agents-sync` and `check:corpus-sync` — were
   * both bounded at a drain ceiling (`sync-drain.ts`), and this instrument now locates NOTHING. THE
   * ANSWER WAS NOT THE ONE THE FALSE POSITIVE PREDICTED, and that is worth recording rather than
   * quietly overwriting. The standing reading was that a drift-shaped worklist "drains to zero with one
   * idempotent command and may need no ceiling at all", which both halves of the evidence supported:
   * both read 0 on the day they were examined, and both drain on a single `sync-*` call. Measured, that
   * does not settle it — what a list reads today is not what it can reach, and a cheap drain is not a
   * drain that RUNS. Nothing schedules either command, both checks are WARN-only and local-only, and
   * the seed→live gap is OPENED by a different ceremony (ADR-0095 graduation) than the one that closes
   * it. The differential control found `check:corpus-sync` printing a SIX-item worklist while exiting
   * 0, with five of those ids still absent from the live store a month later — they left the SEED
   * rather than draining — and `check:agents-sync` printing three, then two, then one, exit 0 at every
   * point. Both ceilings are therefore ZERO, affordable because each drain is one idempotent command
   * with no per-item judgement, and because each check already SKIPs wherever that command could not
   * run.
   *
   * ZERO HERE MEANS THIS INSTRUMENT IS DRAINED, NOT DISABLED. It still sweeps all 21 `check:*` steps on
   * every run; it simply finds no advisory worklist that no exit code bounds. A NEW unbounded worklist
   * — a new advisory check, or a ceiling removed from an existing one — reds the gate on its first
   * appearance. That is the resting place ADR-0252 D3 describes, and it is the only one of the four
   * chartered instruments to reach it.
   */
  [WARN_LIST_HYGIENE]: 0,
} as const;

// ---------------------------------------------------------------------------
// Served route tables (the mirror-pair-drift facts)
// ---------------------------------------------------------------------------

/**
 * The two surfaces ADR-0176 requires to agree while forbidding them to share code: the studio's
 * `/api/*` router is the REFERENCE, and the desktop backend holds the hand-written copy.
 *
 * Whole DIRECTORIES rather than a hand-listed set of route files, deliberately — a list of files to
 * scan is a second thing somebody must keep in step, and a new route file nobody added to it would be
 * invisible to a sweep that still reported full coverage.
 *
 * THE DESKTOP IS TWO DIRECTORIES, and reading only the first was this instrument's own blind spot —
 * a guard measuring a smaller world than the one it guards. The desktop serves `/api/*` from BOTH
 * `src/backend` (the headless, node:test-provable factory) and `electron/` (the mounts that need the
 * live pool — `backend-entry.ts` mounts `/api/attestations` and `/api/uat/attest`, and its own
 * comment says it re-composes the studio's payload with no studio import: a mirror by its author's
 * description, invisible to the sweep that was supposed to find it). The split is a WIRING boundary,
 * not a re-composition boundary, so scanning one dir dropped real pairs while the instrument still
 * reported a complete sweep. Adding the dir is what put them in view — see the `MIRROR_PAIR_DRIFT`
 * ceiling note, which records that the POPULATION changed, not merely the count.
 */
const REFERENCE_SURFACE = { surface: "studio", dirs: ["apps/studio/server"] };
const MIRROR_SURFACE = {
  surface: "desktop",
  dirs: ["apps/desktop/src/backend", "apps/desktop/electron"],
};

/**
 * Every `/api/*` path a source file DISPATCHES on. Both spellings are read, and both matter:
 * `pathname === "/api/x"` is the router's if-chain, while `pathname !== "/api/x"` is how the
 * desktop's fall-through mount factories claim exactly one route (`build-route.ts`, `adopt-route.ts`,
 * `chat-sse-mount.ts`). A `===`-only scan would silently miss every mounted desktop route — the sweep
 * looking at less than it claims to, which is the class this whole check exists to fence.
 */
const DISPATCH = /pathname\s*(?:===|!==)\s*["'](\/api\/[^"']*)["']/g;

/** Recursively collect the source files of a surface — tests and fixtures serve nothing. */
function walkSourceFiles(absDir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) out.push(...walkSourceFiles(full));
    else if (entry.isFile() && /\.ts$/.test(entry.name) && !/\.(test|fixture)\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Enumerate one surface's served route table from its dispatch sites.
 *
 * THROWS rather than returning an empty table, and both guards are load-bearing. A missing directory
 * or a surface that dispatches NOTHING means the enumeration broke, not that the surface serves
 * nothing — and two empty route tables intersect to zero findings, so a broken enumeration would
 * report a perfectly clean sweep. {@link runDecaySweep} turns the throw into an ESCALATION (the sweep
 * went blind), which is the honest answer and the one no ceiling can clear.
 */
function loadSurfaceRoutes(source: { surface: string; dirs: readonly string[] }): SurfaceRoutes {
  const routes = new Map<string, string>();
  for (const dir of source.dirs) {
    const abs = path.join(repoRoot, dir);
    if (!existsSync(abs)) throw new Error(`${source.surface}: route directory ${dir} does not exist`);
    for (const file of walkSourceFiles(abs)) {
      const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(DISPATCH)) {
        const route = match[1];
        // First dispatcher wins: the report needs ONE place to look, and a route claimed twice is
        // still one route.
        if (route !== undefined && !routes.has(route)) routes.set(route, rel);
      }
    }
  }
  requireObserved(routes.size, `${source.surface}: no /api/* dispatch found in ${source.dirs.join(", ")}`);
  return { surface: source.surface, routes };
}

// ---------------------------------------------------------------------------
// Workspace facts
// ---------------------------------------------------------------------------

/**
 * The workspace globs from `pnpm-workspace.yaml`. A deliberately minimal reader — the file is a
 * flat list of quoted globs and this needs no YAML dependency. A file it cannot read yields no
 * globs, which the caller reports as an instrument failure rather than as a clean sweep.
 */
function workspaceGlobs(root: string): string[] {
  const file = path.join(root, "pnpm-workspace.yaml");
  const globs: string[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/.exec(line);
    if (m?.[1] !== undefined) globs.push(m[1]);
  }
  return globs;
}

/**
 * Resolve every workspace package on disk: its repo-relative directory and the NAME its
 * `package.json` declares. Handles the two glob shapes the workspace file uses — `dir/*` and a
 * literal directory. A child without a readable `package.json` is not a package and contributes
 * nothing.
 */
function loadWorkspaceFacts(root: string): WorkspaceFacts {
  const packageNames = new Set<string>();
  const packageDirs: string[] = [];

  const admit = (relDir: string): void => {
    const manifest = path.join(root, relDir, "package.json");
    if (!existsSync(manifest)) return;
    packageDirs.push(relDir.replace(/\\/g, "/"));
    try {
      const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
      const name = (parsed as { name?: unknown }).name;
      if (typeof name === "string" && name.length > 0) packageNames.add(name);
    } catch {
      // An unparseable manifest still marks a real directory; it just contributes no name.
    }
  };

  for (const glob of workspaceGlobs(root)) {
    if (glob.endsWith("/*")) {
      const parent = glob.slice(0, -2);
      let children: string[] = [];
      try {
        children = readdirSync(path.join(root, parent), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch {
        continue; // a glob whose parent dir is absent contributes no packages
      }
      for (const child of children) admit(`${parent}/${child}`);
    } else {
      admit(glob);
    }
  }
  return {
    packageNames,
    packageDirs,
    exists: (rel) => existsSync(path.join(root, rel)),
  };
}

// ---------------------------------------------------------------------------
// Proof bindings
// ---------------------------------------------------------------------------

/** Recursively collect every `*.md` spec under `absDir` (an unreadable dir yields none). */
function walkSpecFiles(absDir: string): string[] {
  const out: string[] = [];
  try {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const full = path.join(absDir, entry.name);
      if (entry.isDirectory()) out.push(...walkSpecFiles(full));
      else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
    }
  } catch {
    // A missing / unreadable directory contributes no spec files.
  }
  return out;
}

/**
 * The workspace package names a shell command FILTERS. Only `pnpm` invocations carry a workspace
 * filter, so nothing else is inspected; both spellings are read (`--filter x` and `--filter=x`).
 * A filter naming a glob/path selector (`./dir`, `...pkg`, `*`) is NOT a plain package name and is
 * skipped — this instrument judges only the unambiguous case.
 */
function filteredPackages(command: { file: string; args: readonly string[] } | undefined): string[] {
  if (command === undefined || path.basename(command.file).replace(/\.\w+$/, "") !== "pnpm") return [];
  const names: string[] = [];
  for (let i = 0; i < command.args.length; i++) {
    const arg = command.args[i] ?? "";
    let value: string | undefined;
    if (arg === "--filter" || arg === "-F") value = command.args[i + 1];
    else if (arg.startsWith("--filter=")) value = arg.slice("--filter=".length);
    if (value === undefined || value.length === 0) continue;
    // Selectors, not plain names: paths, dependency expansions, patterns.
    if (/^[.\[]|^\.{3}|[*{}]|\.\.\./.test(value)) continue;
    names.push(value);
  }
  return names;
}

/**
 * Load every unit spec's proof binding, projected to the workspace targets it names: the `real` arm's
 * test/source files, and the package each declared `pnpm` command filters. A malformed spec is
 * skipped — an advisory sweep never throws out of one bad file — and a spec with no proof block names
 * nothing.
 *
 * THROWS when it PARSED NOTHING, via {@link requireObserved}, for the reason its three sibling loaders
 * do. This was the one loader that did not, and the gap was measured rather than reasoned: with
 * `stories/` unenumerable the real check reported `WARN — 23 located signal(s), every instrument
 * within its own drain ceiling`, claimed `chartered coverage: 4/4 … are sweeping`, and EXITED 0 —
 * a smaller, greener number over an instrument that read zero specs. Blinding any GUARDED loader the
 * same way ESCALATED and exited 1.
 *
 * THE THRESHOLD IS PARSED SPECS, and the two neighbouring quantities are deliberately not it:
 *
 * - NOT the count of spec FILES. Files that all fail `loadNodeSpec` — the frontmatter-schema-change
 *   case — mean the instrument opened everything and understood none of it. It observed nothing.
 * - NOT the count of BINDINGS. A corpus whose specs parse but declare no proof blocks was fully
 *   observed and genuinely has nothing to judge; redding there would fire on a healthy repo, which is
 *   how an escalation stops being a backstop.
 *
 * Zero parsed covers both blind cases at once (no files ⇒ none parsed) while admitting the healthy one.
 */
function loadProofBindings(storiesDir: string, root: string): ProofBinding[] {
  const bindings: ProofBinding[] = [];
  const specFiles = walkSpecFiles(storiesDir);
  let parsed = 0;
  for (const file of specFiles) {
    let spec: ReturnType<typeof loadNodeSpec>;
    try {
      spec = loadNodeSpec(file);
    } catch {
      continue;
    }
    parsed++;
    const cfg = spec.buildConfig;
    if (cfg === undefined) continue;

    const targets: BoundTarget[] = [];
    const addFilters = (cmd: { file: string; args: readonly string[] } | undefined, role: string): void => {
      for (const name of filteredPackages(cmd)) targets.push({ kind: "package", value: name, role });
    };

    addFilters(cfg.command, "the proof command");
    const real = cfg.real;
    if (real !== undefined) {
      targets.push({ kind: "path", value: real.testFile.replace(/\\/g, "/"), role: "real.testFile" });
      targets.push({ kind: "path", value: real.sourceFile.replace(/\\/g, "/"), role: "real.sourceFile" });
      addFilters(real.typecheck, "the real typecheck wall");
      addFilters(real.proofCommand, "the real proof command");
    }
    if (targets.length === 0) continue;

    bindings.push({
      unitId: spec.id,
      specPath: path.relative(root, file).replace(/\\/g, "/"),
      targets,
    });
  }
  requireObserved(
    parsed,
    `no unit spec parsed under ${path.relative(root, storiesDir).replace(/\\/g, "/") || storiesDir} ` +
      `(${specFiles.length} spec file(s) found)`,
  );
  return bindings;
}

// ---------------------------------------------------------------------------
// Test-file facts (the vacuous-proof facts)
// ---------------------------------------------------------------------------

/** The workspace parents holding every test file `pnpm -r test` runs. */
const TEST_ROOT_DIRS = ["packages", "apps"] as const;

/** Recursively collect `*.test.ts` / `*.test.tsx` under `absDir`, skipping `node_modules`. */
function walkTestFiles(absDir: string): string[] {
  const out: string[] = [];
  try {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(absDir, entry.name);
      if (entry.isDirectory()) out.push(...walkTestFiles(full));
      else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
  } catch {
    // An unreadable directory contributes no files; an EMPTY total is caught by the caller.
  }
  return out;
}

/**
 * Load every test file's facts.
 *
 * THROWS rather than returning an empty list, for the reason `loadSurfaceRoutes` does: a repo with no
 * test files yields no findings, so a broken enumeration reports a perfectly clean sweep.
 * {@link runDecaySweep} turns the throw into an ESCALATION (the sweep went blind), which no ceiling
 * can clear. A file that fails to PARSE is likewise not silently clean — it is dropped from
 * `optionsSkipped` only, and a parse failure across the whole corpus surfaces as the empty-total throw.
 */
function loadTestFileFacts(root: string): TestFileFacts[] {
  const facts: TestFileFacts[] = [];
  for (const dir of TEST_ROOT_DIRS) {
    for (const file of walkTestFiles(path.join(root, dir))) {
      const rel = path.relative(root, file).replace(/\\/g, "/");
      const source = readFileSync(file, "utf8");
      const optionsSkipped = findOptionsFormSkips(source, rel);
      // Only files with an options-form skip can ever produce a finding, so the classifier — the
      // expensive half — runs on those alone.
      if (optionsSkipped.size === 0) {
        facts.push({ path: rel, optionsSkipped, vouching: new Set() });
        continue;
      }
      facts.push({ path: rel, optionsSkipped, vouching: new Set(extractVouchingTestNames(source)) });
    }
  }
  requireObserved(facts.length, `no test files found under ${TEST_ROOT_DIRS.join(", ")}`);
  return facts;
}

// ---------------------------------------------------------------------------
// Gate-check facts (the warn-list-hygiene facts)
// ---------------------------------------------------------------------------

/**
 * The `check:*` scripts the `gate` script ACTUALLY RUNS, read from the gate script itself.
 *
 * A REGISTRY, NOT A SECOND LIST — the same discipline `mirror-pair-drift` uses in deriving its
 * coverage from the real `MIRRORS` registry. A hand-kept list of "which checks are advisory" would be
 * two spellings of one fact drifting apart, which is the class this whole sweep exists to fence.
 */
const GATE_CHECK = /pnpm\s+(check:[\w-]+)/g;
/** `pnpm --filter @storytree/cli exec node --import tsx src/foo.ts [--flag]` */
const CLI_ENTRY = /src\/([\w-]+\.ts)\b/;
/** `node scripts/foo.mjs` */
const SCRIPT_ENTRY = /(scripts\/[\w-]+\.mjs)\b/;
/** A sibling module in the same directory — `import { x } from "./foo.js"`. */
const LOCAL_IMPORT = /from\s+"\.\/([\w-]+)\.js"/g;

/** The npm scripts table, read once. An unreadable/!object `scripts` yields none. */
function loadScripts(root: string): Record<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (typeof scripts !== "object" || scripts === null) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** The repo-relative entry file a check's command runs, or `undefined` for a shape not recognised. */
function checkEntryFile(command: string | undefined): string | undefined {
  if (command === undefined) return undefined;
  const cli = CLI_ENTRY.exec(command);
  if (cli?.[1] !== undefined) return `packages/cli/src/${cli[1]}`;
  const script = SCRIPT_ENTRY.exec(command);
  return script?.[1];
}

/**
 * Enumerate every `check:*` step in `pnpm gate`, with the sources that produce its output: the entry
 * plus ONE HOP of its sibling imports (this repo splits advisory checks entrypoint/judge, and the
 * printed lines live in the judge).
 *
 * THROWS on an empty roster AND on a check whose entry cannot be resolved or read, for the reason
 * {@link loadSurfaceRoutes} and {@link loadTestFileFacts} do: a check this cannot see contributes no
 * findings, so a broken resolution would report a clean sweep over a check it never opened.
 * {@link runDecaySweep} turns the throw into an ESCALATION (the sweep went blind) — the honest answer,
 * and the one no ceiling can clear. A novel command shape is cheap to teach the resolver; silently
 * skipping it is exactly the under-reporting this arc fences.
 */
function loadGateChecks(root: string): GateCheckFacts[] {
  const scripts = loadScripts(root);
  const gate = scripts["gate"];
  if (gate === undefined) throw new Error("the root package.json declares no `gate` script");

  const names = [...new Set([...gate.matchAll(GATE_CHECK)].map((m) => m[1]).filter((n) => n !== undefined))];
  requireObserved(names.length, "the `gate` script runs no `check:*` steps");

  const checks: GateCheckFacts[] = [];
  for (const script of names) {
    const entryFile = checkEntryFile(scripts[script]);
    if (entryFile === undefined) {
      throw new Error(`${script}: cannot resolve an entry file from its command`);
    }
    const entryAbs = path.join(root, entryFile);
    if (!existsSync(entryAbs)) throw new Error(`${script}: entry ${entryFile} does not exist`);

    const entryText = readFileSync(entryAbs, "utf8");
    const sources: GateCheckSource[] = [{ path: entryFile, text: entryText }];
    if (entryFile.startsWith("packages/cli/src/")) {
      for (const match of entryText.matchAll(LOCAL_IMPORT)) {
        const rel = `packages/cli/src/${match[1]}.ts`;
        const abs = path.join(root, rel);
        // A sibling that does not resolve to a `.ts` is a type-only or generated import, not a
        // renderer — it contributes no output and is not a blind spot.
        if (existsSync(abs)) sources.push({ path: rel, text: readFileSync(abs, "utf8") });
      }
    }
    checks.push({ script, entryFile, sources });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

function main(): void {
  const storiesDir = path.join(repoRoot, "stories");

  const instruments: DecayInstrument[] = [
    {
      name: CONTRACT_BINDING_DRIFT,
      ceiling: CEILINGS[CONTRACT_BINDING_DRIFT],
      locates:
        "a unit's registered proof names a workspace target that no longer exists (a dead `--filter` " +
        "exits 0 without running; a path outside every package cannot be built). FALSE POSITIVE: a " +
        "net-new unit that will create a NEW package.",
      run: () => findContractBindingDrift(loadProofBindings(storiesDir, repoRoot), loadWorkspaceFacts(repoRoot)),
    },
    {
      name: MIRROR_PAIR_DRIFT,
      ceiling: CEILINGS[MIRROR_PAIR_DRIFT],
      locates:
        "an `/api/*` route served by BOTH the studio server and the desktop backend that no `MIRRORS` " +
        "row compares, so any divergence between the two implementations has no observer. It is the " +
        "COMPLEMENT of `check:mirror-conformance`, never a re-derivation: that gate proves the pairs " +
        "it registers exactly and BLOCKS; this locates the pairs nobody registered. FALSE POSITIVE: " +
        "serving the same path does not prove the payloads must agree — one surface may be " +
        "deliberately narrower (`/api/me` serves a constant local identity on the desktop and the IAP " +
        "caller's on the studio), or its handler a thin pass-through to shared package code where " +
        "nothing is re-composed; and a `pathname ===` in a POLICY gate reads as a served route. BLIND " +
        "TO: prefix dispatch (`startsWith('/api/db/')`) and any non-literal route expression.",
      run: () =>
        findMirrorPairDrift(
          loadSurfaceRoutes(REFERENCE_SURFACE),
          loadSurfaceRoutes(MIRROR_SURFACE),
          registeredMirrorRoutes(),
        ),
    },
    {
      name: VACUOUS_PROOF,
      ceiling: CEILINGS[VACUOUS_PROOF],
      locates:
        "a test SKIPPED BY THE OPTIONS FORM (`test(name, { skip: !DB }, fn)`) that the repo's own " +
        "classifier — `analyzeObservedTests`, which `check:coverage` reads — reports as running and " +
        "substantively asserting, because it parses only the `.skip`/`.todo` MODIFIER. A proof that " +
        "cannot fail is not a proof (ADR-0211/0249), and here nothing can tell that it did not run. " +
        "FALSE POSITIVE: an invisible skip only misleads something if something reads it — a test " +
        "whose name matches no declared contract makes nothing read covered, and this deliberately " +
        "does not consult the story corpus, so it over-reports there; and skipping offline is usually " +
        "CORRECT (these are mostly live-DB tests), so the finding is never `this should not skip`. " +
        "BLIND TO: an imperative runtime skip in the body (`t.skip(…)`) and a skip value built " +
        "outside the options literal.",
      run: () => findVacuousProof(loadTestFileFacts(repoRoot)),
    },
    {
      name: WARN_LIST_HYGIENE,
      ceiling: CEILINGS[WARN_LIST_HYGIENE],
      locates:
        "an advisory `check:*` step in `pnpm gate` whose printed WARN output is a per-item WORKLIST " +
        "(its size tracks a collection) while no source implementing it sets a non-zero exit code — so " +
        "no size that list reaches ever fails anything. ADR-0252 named `check:coverage`'s 121-contract " +
        "WARN backlog as this instrument's live counter-example; it was BOUNDED on 2026-07-28 " +
        "(`coverage-drain.ts`) and is no longer located here. FALSE POSITIVE: a worklist that is a DRIFT " +
        "between two surfaces drains with one idempotent command and MAY need no ceiling — but that has " +
        "now been tested and did not hold. The two candidates (`check:agents-sync` / `check:corpus-sync`) " +
        "were measured printing worklists of 3 and 6 while exiting 0, because nothing schedules the " +
        "drain, so both were bounded instead (`sync-drain.ts`, 2026-07-28). A cheap drain is not a drain " +
        "that runs; the question is the check's REMEDY, not its size today. And SIZE is what makes a list " +
        "unreadable, which this cannot see — it reads source, not a run, so a 1-item worklist and a " +
        "121-item one are indistinguishable here. BLIND TO: output rendered more than one local import " +
        "away or in another package; a check mixing a BLOCKING rule with an advisory worklist (it " +
        "reads as bounded because the exit path exists); and gate steps that are not `check:*` scripts.",
      run: () => findWarnListHygiene(loadGateChecks(repoRoot)),
    },
  ];

  const verdict = runDecaySweep(instruments);
  const { failed, lines } = formatDecaySweep(verdict, instruments);
  for (const line of lines) (failed ? console.error : verdict.count > 0 ? console.warn : console.log)(line);
  // Advisory PER FINDING. Two independent fail-closed conditions: the COUNT past the ceiling
  // (ADR-0252 D3), and any ESCALATION (D1) — which no ceiling change can clear.
  if (failed) process.exitCode = 1;
}

main();
