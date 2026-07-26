/**
 * The PURE judge behind `pnpm check:verification-decay` — the continuous mechanical half of the
 * verification-decay detection pass (ADR-0252 D1/D2/D3, `verification-integrity-arc`).
 *
 * WHY THIS EXISTS. The arc's chartering audit found every serious defect in the PROOF layer, and
 * their common property is that **none of them can ever go red**: a stale oracle report, a vacuous
 * test, and two drifted mirror surfaces all look identical to a healthy system from the outside.
 * Nothing routine surfaces them. ADR-0252 settled the answer: cheap mechanical sweeps run on every
 * `pnpm gate` as ADVISORY warns, and an expensive adversarial pass — judgment-gated, in a fresh
 * session — is what turns a located region into an established defect.
 *
 * THE POSTURE IS LOAD-BEARING, NOT TIMIDITY. Metrics alone were wrong about the specific defect
 * roughly three times in four across the chartering audit (3 of 4 headline aggregate findings were
 * REFUTED under adversarial verification), so **a metric threshold is never itself a finding** and a
 * gate that BLOCKED per finding would be wrong on the measured evidence. But the metrics were right
 * about the REGION every time. So every instrument here LOCATES; none of them adjudicates.
 *
 * That is exactly why this file is NOT `check-mirror-conformance.ts` (ADR-0251), which BLOCKS: that
 * gate makes an exact equality assertion between two implementations over one input — a divergence
 * is a defect by construction, with no false-positive surface. These are heuristics. The two are
 * complements, and the boundary between them is whether the signal can be wrong.
 *
 * ENFORCEMENT IS ON THE COUNT, NOT THE FINDING (ADR-0252 D3). No individual finding blocks a
 * landing; the sweep FAILs when the backlog grows past a fixed ceiling — the `check:friction-drain`
 * shape (ADR-0168 D4). This is the concrete answer to the arc's own guardrail, *an advisory list
 * stays readable or stops being advisory*, against the live counter-example of `check:coverage`'s
 * 121-contract WARN backlog: the list cannot silently grow, because growth is what reds the gate.
 *
 * Pure and injectable — every instrument judges FACTS handed to it, never disk. The disk enumeration
 * lives in the thin {@link file://./check-verification-decay.ts} entrypoint.
 */

// ---------------------------------------------------------------------------
// The finding + instrument vocabulary
// ---------------------------------------------------------------------------

/**
 * One thing a cheap mechanical instrument LOCATED. Deliberately not called a "defect": establishing
 * that is the deep adversarial pass's job, and it must state a concrete failure scenario as *inputs
 * to wrong outcome* before a finding stands (ADR-0252 D4).
 */
export interface DecayFinding {
  /** The instrument that located it — the report groups by this. */
  instrument: string;
  /** Stable identity across runs: the ceiling counts these, so it must not vary run to run. */
  id: string;
  /** Where to look — a repo-relative path or a unit id. */
  where: string;
  /** What was observed, in one line. Never a verdict; an observation. */
  detail: string;
}

/**
 * A registered instrument. ADD A ROW as each of ADR-0252's cheap checks lands — the ceiling and the
 * report are instrument-agnostic, so a new instrument is a row rather than a redesign (the same
 * property `check-mirror-conformance.ts`'s `MIRRORS` registry has).
 */
export interface DecayInstrument {
  /** Short slug used in output and in finding ids. */
  name: string;
  /** What it LOCATES, and — stated, never implied — the false-positive surface it carries. */
  locates: string;
  /** Produce this instrument's findings from already-loaded facts. Must never throw. */
  run: () => DecayFinding[];
}

// ---------------------------------------------------------------------------
// Instrument: contract-binding drift (ADR-0252 D1, the fourth named cheap check)
// ---------------------------------------------------------------------------

/** A workspace target a proof binding names, and the role the binding gives it. */
export interface BoundTarget {
  /** `path` — a repo-relative file the proof reads/writes; `package` — a `pnpm --filter <name>` target. */
  kind: "path" | "package";
  /** The repo-relative path, or the package name. */
  value: string;
  /** Which arm of the proof block named it — quoted back so the report says what to repair. */
  role: string;
}

/** One unit's proof binding, projected to just the workspace targets it names. */
export interface ProofBinding {
  /** The unit id (the spec's frontmatter id). */
  unitId: string;
  /** Repo-relative spec path — where the repair is made. */
  specPath: string;
  /** Every workspace target the proof block names, in declaration order. */
  targets: readonly BoundTarget[];
}

/** The workspace as it actually is on disk — the truth a binding is judged against. */
export interface WorkspaceFacts {
  /** Every package NAME a workspace `package.json` declares. */
  packageNames: ReadonlySet<string>;
  /** Every workspace package DIRECTORY, repo-relative and forward-slashed (e.g. `packages/cli`). */
  packageDirs: readonly string[];
  /**
   * Does this repo-relative path exist on disk? Injected rather than read here so the whole rule
   * stays pure and fixture-testable (the `CoverageGateDeps` pattern).
   */
  exists: (repoRelPath: string) => boolean;
}

export const CONTRACT_BINDING_DRIFT = "contract-binding-drift";

/**
 * PURE: is `filePath` inside `dir`? SEGMENT-AWARE on purpose — a bare `startsWith` would call
 * `packages/library-review/x.ts` a member of `packages/library`, and a path check that silently
 * over-matches is itself the class this arc exists to fence (the chartering audit confirmed exactly
 * that bug elsewhere in the repo). Both sides are forward-slashed, repo-relative, and un-dotted.
 */
export function isInsideDir(filePath: string, dir: string): boolean {
  if (dir.length === 0) return false;
  if (!filePath.startsWith(dir)) return false;
  // Equal is not "inside" — a directory is not a file within itself.
  return filePath.length > dir.length && filePath[dir.length] === "/";
}

/**
 * PURE: is this one bound target DEAD — does the workspace fail to provide it?
 *
 * TWO SIGNALS, one class:
 *
 * - **A `pnpm --filter <name>` naming a package no workspace provides.** The sharper one:
 *   `pnpm --filter <missing> typecheck` prints "No projects matched the filters" and **exits 0**
 *   (measured, pnpm 9.15). A declared typecheck WALL (ADR-0031 §2 — the only thing that catches
 *   type-illegal-but-runtime-green code before promotion) therefore passes having checked nothing.
 * - **A bound PATH that neither exists nor could be authored.** Existence alone is not the test: a
 *   `real.testFile` is the file the leaf will AUTHOR, so a missing one inside a package that exists
 *   is ordinary pending net-new work and is NOT drift. It is drift only when the path is missing AND
 *   lies outside every workspace package — nothing can author it there, because the package it names
 *   is gone (`packages/core` dissolved by ADR-0068, `packages/store` by ADR-0077).
 *
 * Both halves of the path test are load-bearing. Dropping existence would flag a `sourceFile` that
 * legitimately points outside the packages at a real file (`stories/**` specs, which the machine-
 * converted UAT legs of ADR-0184 genuinely edit). Dropping the package test would flag every honest
 * net-new test file. Neither alone is the rule.
 */
function isDeadTarget(target: BoundTarget, workspace: WorkspaceFacts): boolean {
  if (target.kind === "package") return !workspace.packageNames.has(target.value);
  if (workspace.exists(target.value)) return false;
  return !workspace.packageDirs.some((dir) => isInsideDir(target.value, dir));
}

/**
 * PURE: locate units whose registered proof binding names a workspace target that no longer exists.
 *
 * ONE FINDING PER UNIT, listing every dead target it names. The granularity is deliberate: a spec
 * bound to a dissolved package names it in its proof command, its `real.testFile` AND its
 * `real.sourceFile`, but that is ONE repair — re-bind the node to where the code actually lives, or
 * retire it. The ceiling counts repairs, not mentions, or a single stale spec would consume three
 * units of a budget meant to measure backlog.
 *
 * THE FALSE-POSITIVE SURFACE, stated rather than implied: a net-new unit that will create a NEW
 * package legitimately binds paths outside every package that exists today, and reads as drift here.
 * That is why this is advisory and not a block.
 */
export function findContractBindingDrift(
  bindings: readonly ProofBinding[],
  workspace: WorkspaceFacts,
): DecayFinding[] {
  const findings: DecayFinding[] = [];
  for (const binding of bindings) {
    const dead: string[] = [];
    const seen = new Set<string>();
    for (const target of binding.targets) {
      if (!isDeadTarget(target, workspace)) continue;
      const phrase =
        target.kind === "package"
          ? `${target.role} filters \`${target.value}\` (no workspace package provides it, so \`pnpm --filter\` exits 0 without running)`
          : `${target.role} binds \`${target.value}\` (missing, and outside every workspace package)`;
      if (seen.has(phrase)) continue;
      seen.add(phrase);
      dead.push(phrase);
    }
    if (dead.length === 0) continue;
    findings.push({
      instrument: CONTRACT_BINDING_DRIFT,
      id: `${CONTRACT_BINDING_DRIFT}:${binding.unitId}`,
      where: binding.specPath,
      detail: `${binding.unitId}: ${dead.join("; ")}`,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// The ceiling (ADR-0252 D3 — the `check:friction-drain` shape, on the COUNT)
// ---------------------------------------------------------------------------

/** The sweep's outcome: advisory findings, plus the one thing that can red the gate. */
export interface DecayVerdict {
  /** Every located finding, instrument by instrument, in run order. */
  findings: readonly DecayFinding[];
  /** `findings.length` — the number the ceiling governs. */
  count: number;
  /** The fixed ceiling the count is held to. */
  ceiling: number;
  /** `ok` while count ≤ ceiling; `red` the moment the backlog GROWS past it. */
  level: "ok" | "red";
}

/**
 * PURE: hold the sweep's total finding COUNT to a fixed ceiling.
 *
 * Advisory per finding, fail-closed on growth (ADR-0252 D3). The ceiling is TUNED ON THE FIRST REAL
 * SWEEP rather than picked in advance — set to exactly what that sweep found, so it starts GREEN on
 * an honest baseline and can only ever be tightened. Adding a finding without repairing one reds the
 * gate; that is the whole mechanism by which this list cannot decay into `check:coverage`'s
 * 121-contract condition.
 */
export function evaluateDecayCeiling(
  findings: readonly DecayFinding[],
  ceiling: number,
): DecayVerdict {
  const count = findings.length;
  return { findings, count, ceiling, level: count > ceiling ? "red" : "ok" };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const TAG = "[check:verification-decay]";

/**
 * PURE: render the sweep as console lines plus the exit decision. Never throws, never exits — the
 * thin entrypoint prints and sets the exit code, so the whole WARN/RED decision is fixture-testable.
 *
 * Every report states the two-phase discipline explicitly, because a located region read as an
 * established defect is the specific way this instrument gets misused (ADR-0252 D4).
 */
export function formatDecaySweep(
  verdict: DecayVerdict,
  instruments: readonly DecayInstrument[],
): { failed: boolean; lines: string[] } {
  const lines: string[] = [];
  const coverage = `${instruments.length} instrument(s): ${instruments.map((i) => i.name).join(", ")}`;

  if (verdict.count === 0) {
    lines.push(`${TAG} OK — no verification-decay signal located (${coverage}).`);
    return { failed: false, lines };
  }

  const headline =
    verdict.level === "red"
      ? `${TAG} RED — ${verdict.count} located signal(s), past the drain ceiling of ${verdict.ceiling} (${coverage}).`
      : `${TAG} WARN — ${verdict.count} located signal(s), within the drain ceiling of ${verdict.ceiling} (${coverage}).`;
  lines.push(headline);
  lines.push(
    `${TAG}   These LOCATE regions; they do not establish defects. A metric is never itself a finding ` +
      "(ADR-0252): adversarially verify before repairing, and state the failure scenario as inputs → wrong outcome.",
  );

  for (const inst of instruments) {
    const mine = verdict.findings.filter((f) => f.instrument === inst.name);
    if (mine.length === 0) continue;
    lines.push(`${TAG}   ${inst.name} (${mine.length}) — ${inst.locates}`);
    for (const f of mine) lines.push(`${TAG}     · ${f.detail}  [${f.where}]`);
  }

  if (verdict.level === "red") {
    lines.push(
      `${TAG}   Landing is blocked until the count returns to ${verdict.ceiling} or below. Repair a located ` +
        "signal (verify it first), or — if the growth is legitimate and verified — raise the ceiling in " +
        "`packages/cli/src/check-verification-decay.ts` with the reason recorded in the commit.",
    );
  }
  return { failed: verdict.level === "red", lines };
}

/**
 * Run every registered instrument and hold the total to the ceiling. An instrument that THROWS is
 * fenced to itself: it becomes a finding of its own rather than taking the sweep down, because a
 * sweep that silently stops sweeping is precisely a check that cannot go red.
 */
export function runDecaySweep(
  instruments: readonly DecayInstrument[],
  ceiling: number,
): DecayVerdict {
  const findings: DecayFinding[] = [];
  for (const inst of instruments) {
    try {
      findings.push(...inst.run());
    } catch (err) {
      findings.push({
        instrument: inst.name,
        id: `${inst.name}:instrument-failed`,
        where: inst.name,
        detail: `instrument failed to run (${(err as Error).message}) — it swept nothing, so it proved nothing`,
      });
    }
  }
  return evaluateDecayCeiling(findings, ceiling);
}
