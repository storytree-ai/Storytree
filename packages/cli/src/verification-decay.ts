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
 * THE SECOND, INDEPENDENT MECHANISM: ESCALATION (ADR-0252 D1). The deep adversarial pass is
 * judgment-gated at arc close, and D1 records the accepted residual plainly — *a judgment gate can
 * decline indefinitely, so the continuous half must be able to force the question*. That is what an
 * ESCALATION is: a finding the cheap half declares it CANNOT SETTLE, which reds the gate on its own
 * and whose only discharge is cutting the fresh-session adversarial pass (`asset:verification-decay-
 * detection`). It is deliberately NOT the ceiling wearing a second hat:
 *
 * - The **ceiling** governs the SIZE of a backlog of located regions. Its remedy is a DRAIN — repair,
 *   retire, or refute an item (or, with a recorded reason, raise it).
 * - An **escalation** governs the cheap half's ability to answer at all. Its remedy is a PASS. Raising
 *   `DRAIN_CEILING` can never clear one, and {@link evaluateDecayCeiling} enforces that by excluding
 *   escalations from the count entirely — an instrument that swept nothing LOCATED nothing, so it is
 *   not backlog, and letting it consume drain budget would invite exactly the wrong repair.
 *
 * This is NOT a calendar cadence. ADR-0252 D1 rejected all three offered (monthly-or-arc-close,
 * monthly, arc-close-unconditionally), so the line is a property of the SIGNAL, never of the clock.
 *
 * And escalating is not adjudicating: *a metric threshold is never itself a finding* still holds in
 * full. An escalation asserts an obligation to LOOK, never that a defect exists — the same shape D3's
 * ceiling already has, pointed at a different failure.
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
  /**
   * PRESENT = this finding is past the escalation line (ADR-0252 D1), and this is WHY, in one line.
   *
   * An instrument sets it for the narrow class it declares itself unable to settle — not for a signal
   * it merely finds alarming. The distinction is the whole point: an ordinary finding LOCATES a region
   * a later adversarial pass may or may not confirm, so it stays advisory; an escalating finding says
   * *the cheap half cannot answer this at all*, which is precisely the condition the deep pass exists
   * for and precisely the condition a judgment gate must not be allowed to decline indefinitely.
   *
   * ABSENT (the default) on every ordinary located region. If in doubt, leave it absent — an
   * escalation that fires on noise trains the reader to clear it, which is the failure mode that
   * would make it stop being a backstop.
   */
  escalation?: string;
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
  /**
   * Produce this instrument's findings from already-loaded facts. Must never throw — and if it does,
   * {@link runDecaySweep} converts the failure into an ESCALATING finding rather than letting the
   * sweep die quietly.
   *
   * An instrument MAY set {@link DecayFinding.escalation} on the narrow class it cannot settle. Most
   * findings should not carry one.
   */
  run: () => DecayFinding[];
}

/**
 * The four cheap instruments ADR-0252 D1 CHARTERED, by slug — the roster the registry is measured
 * against, so `1 of 4 registered` is a machine fact on every run rather than a source comment
 * somebody must remember to update. Increment #949 recorded exactly this gap in prose, and prose in
 * a source header is a finding held by hand.
 *
 * Deliberately REPORTED, never escalated. An unbuilt instrument is an absence, not a signal that
 * crossed a line, and reddening the gate until three more land would block every unrelated landing
 * for work no landing session owes. What it buys instead is honesty at the judgment gate: the
 * orchestrator declining the deep pass at arc close is partly reading the continuous half's silence
 * as reassurance, and silence over an instrument that never ran is not evidence.
 */
export const CHARTERED_INSTRUMENTS: readonly string[] = [
  "contract-binding-drift",
  "mirror-pair-drift",
  "vacuous-proof",
  "warn-list-hygiene",
];

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

/** The sweep's outcome: advisory findings, plus the two independent things that can red the gate. */
export interface DecayVerdict {
  /** Every finding, instrument by instrument, in run order — escalating ones included. */
  findings: readonly DecayFinding[];
  /** The number the ceiling governs: located regions ONLY, escalations excluded. */
  count: number;
  /** The fixed ceiling the count is held to. */
  ceiling: number;
  /** `ok` while count ≤ ceiling; `red` the moment the BACKLOG grows past it. Says nothing about escalation. */
  level: "ok" | "red";
  /**
   * Every finding past the escalation line (ADR-0252 D1). Non-empty reds the gate on its own, at any
   * ceiling — the ceiling and the escalation are separate mechanisms with separate remedies.
   */
  escalations: readonly DecayFinding[];
}

/**
 * PURE: hold the sweep's located-region COUNT to a fixed ceiling, and surface escalations beside it.
 *
 * Advisory per finding, fail-closed on growth (ADR-0252 D3). The ceiling is TUNED ON THE FIRST REAL
 * SWEEP rather than picked in advance — set to exactly what that sweep found, so it starts GREEN on
 * an honest baseline and can only ever be tightened. Adding a finding without repairing one reds the
 * gate; that is the whole mechanism by which this list cannot decay into `check:coverage`'s
 * 121-contract condition.
 *
 * ESCALATIONS ARE NOT COUNTED, and that exclusion is load-bearing in both directions (ADR-0252 D1):
 *
 * - It keeps the ceiling honest as a measure of BACKLOG. An instrument that failed to run located
 *   nothing; counting its failure as one unit of backlog would say the repo grew a stale binding when
 *   what actually happened is that the sweep went blind.
 * - It keeps the escalation UNCLEARABLE BY THE CEILING. If escalations counted, raising
 *   `DRAIN_CEILING` — a legitimate, documented move for real backlog growth — would silently discharge
 *   an escalation too, and the backstop would be defeated by the routine operation of its neighbour.
 *   That is the `process:verification-decay-detection` "gaming the D3 ceiling" failure mode arriving
 *   through the front door, by accident rather than by intent.
 */
export function evaluateDecayCeiling(
  findings: readonly DecayFinding[],
  ceiling: number,
): DecayVerdict {
  const escalations = findings.filter((f) => f.escalation !== undefined);
  const count = findings.length - escalations.length;
  return { findings, count, ceiling, level: count > ceiling ? "red" : "ok", escalations };
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
  const registered = instruments.map((i) => i.name);
  const coverage = `${instruments.length} instrument(s): ${registered.join(", ")}`;
  // The chartered roster, reported every run so an unswept instrument is a machine fact rather than
  // a source comment — and so the deep pass is never declined on the strength of a silence that
  // covers instruments which never ran (ADR-0252 D1). Reported, never escalated.
  const unswept = CHARTERED_INSTRUMENTS.filter((name) => !registered.includes(name));
  const charter =
    unswept.length === 0
      ? `${TAG}   chartered coverage: ${CHARTERED_INSTRUMENTS.length}/${CHARTERED_INSTRUMENTS.length} of ADR-0252 D1's cheap instruments are sweeping.`
      : `${TAG}   chartered coverage: ${CHARTERED_INSTRUMENTS.length - unswept.length}/${CHARTERED_INSTRUMENTS.length} of ADR-0252 D1's cheap instruments are sweeping — NOT swept: ` +
        `${unswept.join(", ")}. Silence over an unswept instrument is not evidence.`;

  const escalated = verdict.escalations.length > 0;

  if (verdict.count === 0 && !escalated) {
    lines.push(`${TAG} OK — no verification-decay signal located (${coverage}).`);
    lines.push(charter);
    return { failed: false, lines };
  }

  // ESCALATION FIRST, and headlined separately from the ceiling: the two conditions are independent
  // and their remedies are different (a PASS, not a DRAIN). Reporting them under one banner is how a
  // reader would come to believe raising the ceiling clears both.
  if (escalated) {
    lines.push(
      `${TAG} ESCALATED — ${verdict.escalations.length} signal(s) past the escalation line (${coverage}). ` +
        "The cheap half cannot settle these.",
    );
    for (const f of verdict.escalations) {
      lines.push(`${TAG}     ! ${f.detail}  [${f.where}]`);
      lines.push(`${TAG}       why it escalates: ${f.escalation ?? ""}`);
    }
    lines.push(
      `${TAG}   REQUIRED RESPONSE — cut the deep adversarial pass in a FRESH SESSION (never an ` +
        "in-session subagent of the session that landed the work): `storytree library artifact " +
        "verification-decay-detection --pg`. ADR-0252 D1: the arc-close judgment gate can decline " +
        "indefinitely, so this is the continuous half forcing the question.",
    );
    lines.push(
      `${TAG}   Raising the drain ceiling CANNOT clear an escalation — escalations are not counted ` +
        "against it. Nor does repairing an unrelated located signal. Restore the instrument, then run the pass.",
    );
  }

  if (verdict.count > 0) {
    const headline =
      verdict.level === "red"
        ? `${TAG} RED — ${verdict.count} located signal(s), past the drain ceiling of ${verdict.ceiling} (${coverage}).`
        : `${TAG} WARN — ${verdict.count} located signal(s), within the drain ceiling of ${verdict.ceiling} (${coverage}).`;
    lines.push(headline);
    lines.push(
      `${TAG}   These LOCATE regions; they do not establish defects. A metric is never itself a finding ` +
        "(ADR-0252): adversarially verify before repairing, and state the failure scenario as inputs → wrong outcome.",
    );
  }

  for (const inst of instruments) {
    const mine = verdict.findings.filter(
      (f) => f.instrument === inst.name && f.escalation === undefined,
    );
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
  lines.push(charter);
  return { failed: verdict.level === "red" || escalated, lines };
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
        // THE FIRST ESCALATION LINE, and the one this sweep can observe about itself. A dead
        // instrument is not backlog to be drained — it is the continuous half having stopped
        // continuing, which no amount of repairing OTHER findings fixes and which the cheap half
        // cannot settle by definition (it is the thing that would have done the settling). Before
        // this, the failure was filed as one ordinary signal: with the ceiling at 5 and the sole
        // instrument dead, `check:verification-decay` printed "1 located signal, within the drain
        // ceiling" and EXITED 0 — a green gate over a blind sweep, which is the exact class this
        // whole arc exists to fence, occurring inside the instrument built to fence it.
        escalation:
          "the sweep went BLIND here — this instrument observed nothing, so its silence is not " +
          "evidence, and no repair to another finding restores what it did not look at",
      });
    }
  }
  return evaluateDecayCeiling(findings, ceiling);
}
