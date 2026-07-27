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
 * - A **ceiling** governs the SIZE of one instrument's backlog of located regions. Its remedy is a
 *   DRAIN — repair, retire, or refute an item (or, with a recorded reason, raise that instrument's).
 * - An **escalation** governs the cheap half's ability to answer at all. Its remedy is a PASS. Raising
 *   a ceiling can never clear one, and {@link evaluateDecayCeiling} enforces that by excluding
 *   escalations from every count entirely — an instrument that swept nothing LOCATED nothing, so it is
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
   * THIS instrument's drain ceiling — its own backlog baseline, tuned on its own first real sweep
   * (ADR-0252 D3). See {@link evaluateDecayCeiling} for why the ceiling is per-instrument rather
   * than one shared total. It ratchets DOWN as findings are repaired; raising it is a deliberate act
   * whose reason belongs in the commit message.
   */
  ceiling: number;
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
// Instrument: mirror-pair drift (ADR-0252 D1, the second named cheap check)
// ---------------------------------------------------------------------------

/**
 * One surface's SERVED route table, as enumerated from its request-dispatch sites.
 *
 * `routes` maps each `/api/*` path the surface dispatches on to the repo-relative file that
 * dispatches it — the file is carried so a finding says where to look on each side, not merely that
 * something is wrong somewhere.
 */
export interface SurfaceRoutes {
  /** The surface's name, spelled as the `MIRRORS` registry spells it (`studio`, `desktop`). */
  surface: string;
  /** Route path → the repo-relative file whose dispatch claims it. */
  routes: ReadonlyMap<string, string>;
}

export const MIRROR_PAIR_DRIFT = "mirror-pair-drift";

/**
 * PURE: locate `/api/*` routes that BOTH surfaces serve but which no `MIRRORS` row compares.
 *
 * THE BOUNDARY THIS SITS ON, and it is the whole design constraint (ADR-0251's reconciliation with
 * ADR-0252). `check:mirror-conformance` proves the pairs in its registry EXACTLY and BLOCKS: an
 * equality assertion between two implementations over one input has no false-positive surface, so a
 * divergence is a defect by construction. This instrument does NOT re-derive any of that. Its target
 * is the registry's SILENCE — the pairs nobody registered, over which drift has no observer at all.
 * That is a discovery heuristic, it does have a real false-positive surface, and so it is advisory.
 * Blurring the two would be both redundant and wrong-postured.
 *
 * WHY THE PAIRS MATTER. The desktop backend re-composes a SUBSET of the studio's `/api/*` table
 * verbatim over its own `node:fs` and may never import the studio (ADR-0176, enforced by
 * `check:boundaries`) — and both surfaces serve the SAME compiled studio SPA, so the same client
 * code calls both. Duplication is the DECISION; the drift it invites is the defect. It has gone
 * uncaught once already, measurably: commit `71f68d2b` folded `parseAdrWireSignals` into the
 * studio's `listDocs` and left the desktop's copy alone, silently dropping `loadBearing` from 88
 * ADRs, with nothing red anywhere — the two implementations agreed with nothing, so their
 * disagreement had no observer. A registered pair now has one. An unregistered pair does not.
 *
 * ONE FINDING PER ROUTE. The repair is per-payload — a probe on each surface plus a registry row —
 * so the ceiling counts repairs, not mentions (the granularity #949 settled).
 *
 * THE FALSE-POSITIVE SURFACE, stated rather than implied, because this instrument LOCATES and never
 * adjudicates:
 *
 * - **Serving the same path does not prove the two payloads are REQUIRED to agree.** A route may be
 *   deliberately narrower on one surface, or its handler may be a thin pass-through to shared
 *   package code — where nothing is re-composed, so no drift class opens and a registry row would be
 *   ceremony. Only an adversarial pass can tell those from a genuine unobserved mirror.
 * - **A `pathname === '/api/x'` in a POLICY gate reads as a served route.** `guestPolicy.ts` compares
 *   pathnames to decide access, not to serve; those paths are also served by the real route table
 *   today, so it changes nothing now, but the rule cannot tell the two apart.
 *
 * AND ITS BLIND SPOTS, stated for the same reason (the arc's no-silent-caps rule): a route dispatched
 * by PREFIX (`pathname.startsWith('/api/db/')`) or by any non-literal expression is invisible to the
 * enumeration, so this under-reports rather than over-reports there.
 */
export function findMirrorPairDrift(
  reference: SurfaceRoutes,
  mirror: SurfaceRoutes,
  registered: ReadonlySet<string>,
): DecayFinding[] {
  const findings: DecayFinding[] = [];
  // Sorted so the report — and therefore the ceiling's view of the backlog — is stable run to run.
  for (const route of [...reference.routes.keys()].sort()) {
    const mirrorFile = mirror.routes.get(route);
    if (mirrorFile === undefined) continue; // served by one surface only: no pair, no drift class
    if (registered.has(route)) continue; // already proven EXACTLY by `check:mirror-conformance`
    const referenceFile = reference.routes.get(route) ?? "(unknown)";
    findings.push({
      instrument: MIRROR_PAIR_DRIFT,
      id: `${MIRROR_PAIR_DRIFT}:${route}`,
      where: mirrorFile,
      // AN OBSERVATION, NOT A VERDICT. It says two independent implementations exist and nothing
      // compares them — never that they are REQUIRED to agree, which is exactly the question the
      // adversarial pass answers. `/api/me` is the case that keeps this honest: the desktop serves a
      // constant local identity where the studio serves the IAP caller's, so the two must differ in
      // VALUE while their shape must not. An instrument that asserted "required to agree" would have
      // adjudicated that, and been wrong about it.
      detail:
        `\`${route}\` is served by BOTH ${reference.surface} (${referenceFile}) and ` +
        `${mirror.surface} (${mirrorFile}) — two independent implementations of one route — and no ` +
        "`MIRRORS` row compares them, so any divergence between them has no observer",
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// The ceiling (ADR-0252 D3 — the `check:friction-drain` shape, on the COUNT)
// ---------------------------------------------------------------------------

/** One instrument's backlog, held to that instrument's own ceiling. */
export interface InstrumentTally {
  /** The instrument's slug. */
  instrument: string;
  /** Located regions attributed to it — escalations excluded. */
  count: number;
  /** Its own ceiling. */
  ceiling: number;
  /** `ok` while count ≤ ceiling; `red` the moment THIS instrument's backlog grows past its own. */
  level: "ok" | "red";
}

/** The name and ceiling {@link evaluateDecayCeiling} needs — the judgeable part of an instrument. */
export interface CeilingSpec {
  name: string;
  ceiling: number;
}

/** The sweep's outcome: advisory findings, plus the two independent things that can red the gate. */
export interface DecayVerdict {
  /** Every finding, instrument by instrument, in run order — escalating ones included. */
  findings: readonly DecayFinding[];
  /** Per-instrument backlogs — the level that actually enforces. */
  tallies: readonly InstrumentTally[];
  /** Total located regions across every instrument, escalations excluded. REPORTED, never enforced. */
  count: number;
  /** The sum of the per-instrument ceilings. REPORTED, never enforced. */
  ceiling: number;
  /** `red` when ANY instrument is over its OWN ceiling. Says nothing about escalation. */
  level: "ok" | "red";
  /**
   * Every finding past the escalation line (ADR-0252 D1). Non-empty reds the gate on its own, at any
   * ceiling — the ceiling and the escalation are separate mechanisms with separate remedies.
   */
  escalations: readonly DecayFinding[];
}

/**
 * PURE: hold each instrument's located-region COUNT to ITS OWN ceiling, and surface escalations
 * beside them.
 *
 * Advisory per finding, fail-closed on growth (ADR-0252 D3). A ceiling is TUNED ON THAT INSTRUMENT'S
 * FIRST REAL SWEEP rather than picked in advance — set to exactly what that sweep found, so it starts
 * GREEN on an honest baseline and can only ever be tightened. Adding a finding without repairing one
 * reds the gate; that is the whole mechanism by which this list cannot decay into `check:coverage`'s
 * 121-contract condition.
 *
 * WHY PER-INSTRUMENT AND NOT ONE SHARED TOTAL. The sweep shipped with a single global ceiling, which
 * was right while one instrument existed and became wrong the moment a second one landed. Two defects
 * appear at exactly that point, and both are this arc's own class:
 *
 * - **A shared total PRICES the arc's remaining work.** ADR-0252 charters FOUR cheap instruments. Under
 *   one total, every new instrument arrives carrying its whole honest baseline as growth and reds the
 *   gate on landing — so the cheapest way to add an instrument is to weaken it until it finds little.
 *   A mechanism that pays you to look less is the failure this arc exists to fence, and it would have
 *   been operating inside the machinery built to fence it.
 * - **A shared total makes unrelated backlogs FUNGIBLE.** Under one number, repairing a contract
 *   binding buys silence for a new unobserved mirror pair. The two have nothing to do with each other,
 *   and a budget that lets one discharge the other stops measuring either.
 *
 * Splitting the ceiling keeps everything D3 asked for — enforcement on the COUNT and not the finding,
 * fail-closed on growth, the `check:friction-drain` shape — and removes both. The total is still
 * reported, because a reader wants the size of the whole backlog; it is simply never what enforces.
 *
 * A finding from an instrument with NO declared ceiling is held to ZERO, so it reds immediately.
 * Fail-closed on purpose: unattributed backlog is exactly the thing that must not accumulate quietly.
 *
 * ESCALATIONS ARE NOT COUNTED, and that exclusion is load-bearing in both directions (ADR-0252 D1):
 *
 * - It keeps a ceiling honest as a measure of BACKLOG. An instrument that failed to run located
 *   nothing; counting its failure as one unit of backlog would say the repo grew a stale binding when
 *   what actually happened is that the sweep went blind.
 * - It keeps the escalation UNCLEARABLE BY ANY CEILING. If escalations counted, raising a ceiling — a
 *   legitimate, documented move for real backlog growth — would silently discharge an escalation too,
 *   and the backstop would be defeated by the routine operation of its neighbour. That is the
 *   `process:verification-decay-detection` "gaming the D3 ceiling" failure mode arriving through the
 *   front door, by accident rather than by intent.
 */
export function evaluateDecayCeiling(
  findings: readonly DecayFinding[],
  instruments: readonly CeilingSpec[],
): DecayVerdict {
  const escalations = findings.filter((f) => f.escalation !== undefined);
  const located = findings.filter((f) => f.escalation === undefined);

  const ceilings = new Map(instruments.map((i) => [i.name, i.ceiling]));
  // Tally every declared instrument (so a clean one still reports 0/n), plus any instrument that
  // produced a finding without declaring a ceiling — held to 0 rather than silently uncounted.
  const names = [...ceilings.keys()];
  for (const f of located) if (!ceilings.has(f.instrument)) names.push(f.instrument);

  const tallies: InstrumentTally[] = names.map((name) => {
    const count = located.filter((f) => f.instrument === name).length;
    const ceiling = ceilings.get(name) ?? 0;
    return { instrument: name, count, ceiling, level: count > ceiling ? "red" : "ok" };
  });

  return {
    findings,
    tallies,
    count: located.length,
    ceiling: tallies.reduce((sum, t) => sum + t.ceiling, 0),
    level: tallies.some((t) => t.level === "red") ? "red" : "ok",
    escalations,
  };
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
    const breached = verdict.tallies.filter((t) => t.level === "red");
    const headline =
      verdict.level === "red"
        ? `${TAG} RED — ${verdict.count} located signal(s); ${breached.length} instrument(s) past their own drain ceiling (${coverage}).`
        : `${TAG} WARN — ${verdict.count} located signal(s), every instrument within its own drain ceiling (${coverage}).`;
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
    // Each instrument is scored against its OWN ceiling, so the reader can see which backlog grew
    // rather than only that some total moved.
    const tally = verdict.tallies.find((t) => t.instrument === inst.name);
    const score = tally === undefined ? `${mine.length}` : `${tally.count}/${tally.ceiling}`;
    const flag = tally?.level === "red" ? " OVER CEILING" : "";
    lines.push(`${TAG}   ${inst.name} (${score}${flag}) — ${inst.locates}`);
    for (const f of mine) lines.push(`${TAG}     · ${f.detail}  [${f.where}]`);
  }

  if (verdict.level === "red") {
    for (const t of verdict.tallies.filter((x) => x.level === "red")) {
      lines.push(
        `${TAG}   ${t.instrument}: ${t.count} located, ceiling ${t.ceiling}. Landing is blocked until THIS ` +
          `instrument returns to ${t.ceiling} or below — repairing another instrument's signal cannot ` +
          "clear it. Repair a located signal (verify it first), or — if the growth is legitimate and " +
          "verified — raise that instrument's `ceiling` in `packages/cli/src/check-verification-decay.ts` " +
          "with the reason recorded in the commit.",
      );
    }
  }
  lines.push(charter);
  return { failed: verdict.level === "red" || escalated, lines };
}

/**
 * Run every registered instrument and hold the total to the ceiling. An instrument that THROWS is
 * fenced to itself: it becomes a finding of its own rather than taking the sweep down, because a
 * sweep that silently stops sweeping is precisely a check that cannot go red.
 */
export function runDecaySweep(instruments: readonly DecayInstrument[]): DecayVerdict {
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
  return evaluateDecayCeiling(findings, instruments);
}
