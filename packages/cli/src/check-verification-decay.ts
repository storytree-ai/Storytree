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
 * - ADR-0252 names FOUR cheap instruments. **`contract-binding-drift` and `mirror-pair-drift` are
 *   implemented; `vacuous-proof` and `warn-list-hygiene` are NOT swept** (the arc's no-silent-caps
 *   rule — and the sweep reports its own chartered coverage on every run rather than leaving it to
 *   this comment). The registry below is the seam that makes each a row, not a redesign.
 * - ADR-0252 D1's **warn-escalation backstop** now EXISTS, with exactly ONE line declared: an
 *   instrument that FAILED TO RUN (the sweep went blind). It reds the gate independently of the
 *   ceiling and demands the fresh-session adversarial pass. Lines keyed to a signal's AGE or to a
 *   count of declined arc-closes are NOT built — both need persisted per-signal state this
 *   deliberately-stateless sweep does not have, and a clock-keyed line would smuggle back the
 *   calendar cadence D1 rejected outright.
 * - `mirror-pair-drift` locates unregistered pairs; it does NOT repair any. Registering a pair means
 *   authoring a probe on each surface and a `MIRRORS` row, which is a separate increment per payload.
 *
 * On mirror-pair drift specifically, note the boundary ADR-0251 records: `check:mirror-conformance`
 * already proves the pairs in its `MIRRORS` registry EXACTLY, and blocks. The advisory instrument
 * here is the discovery heuristic — finding mirrored pairs MISSING from that registry — never a
 * re-derivation of what the registry already proves.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadNodeSpec } from "@storytree/orchestrator";

import { registeredMirrorRoutes } from "./mirror-conformance.js";
import {
  CONTRACT_BINDING_DRIFT,
  MIRROR_PAIR_DRIFT,
  findContractBindingDrift,
  findMirrorPairDrift,
  formatDecaySweep,
  runDecaySweep,
  type BoundTarget,
  type DecayInstrument,
  type ProofBinding,
  type SurfaceRoutes,
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
   */
  [MIRROR_PAIR_DRIFT]: 10,
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
 */
const REFERENCE_SURFACE = { surface: "studio", dirs: ["apps/studio/server"] };
const MIRROR_SURFACE = { surface: "desktop", dirs: ["apps/desktop/src/backend"] };

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
  if (routes.size === 0) {
    throw new Error(`${source.surface}: no /api/* dispatch found in ${source.dirs.join(", ")}`);
  }
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
 * skipped — an advisory sweep never throws out of the gate — and a spec with no proof block names
 * nothing.
 */
function loadProofBindings(storiesDir: string, root: string): ProofBinding[] {
  const bindings: ProofBinding[] = [];
  for (const file of walkSpecFiles(storiesDir)) {
    let spec: ReturnType<typeof loadNodeSpec>;
    try {
      spec = loadNodeSpec(file);
    } catch {
      continue;
    }
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
  return bindings;
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
  ];

  const verdict = runDecaySweep(instruments);
  const { failed, lines } = formatDecaySweep(verdict, instruments);
  for (const line of lines) (failed ? console.error : verdict.count > 0 ? console.warn : console.log)(line);
  // Advisory PER FINDING. Two independent fail-closed conditions: the COUNT past the ceiling
  // (ADR-0252 D3), and any ESCALATION (D1) — which no ceiling change can clear.
  if (failed) process.exitCode = 1;
}

main();
