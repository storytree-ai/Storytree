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
 * AND THERE IS EXACTLY ONE LINE ON PURPOSE (ADR-0256). The two deferral-keyed lines D1 left open — a
 * signal's AGE, and a count of arc-closes that declined the pass — are decided AGAINST rather than
 * deferred. Both fire only on a persisted record written to TRIGGER them, and the direction is what
 * decides it: a record written to CLEAR a condition is fail-closed (omit it and the gate stays red),
 * while a record written to TRIGGER one is fail-OPEN (omit it and it never fires) — and the party who
 * would write it is the party the backstop fences. The blind-instrument line has no such input: it is
 * observed by the sweep, about itself, in the same run, so there is nothing to omit. The residual is
 * permanent and stated plainly in ADR-0256: a signal that merely sits unexamined escalates nothing.
 *
 * And escalating is not adjudicating: *a metric threshold is never itself a finding* still holds in
 * full. An escalation asserts an obligation to LOOK, never that a defect exists — the same shape D3's
 * ceiling already has, pointed at a different failure.
 *
 * Pure and injectable — every instrument judges FACTS handed to it, never disk. The disk enumeration
 * lives in the thin {@link file://./check-verification-decay.ts} entrypoint. (A rule that parses
 * SOURCE TEXT is still pure and belongs here — {@link findOptionsFormSkips} takes a string and returns
 * facts, exactly as ADR-0126's own extractors do. What must not live here is reading a file.)
 */

// THE PARSER, NOT THE COMPILER — and the reason the alias exists (ADR-0400).
//
// `typescript@7` is the Go-native compiler and its package entry point exports only a version
// stub: the AST surface used below (`createSourceFile`, `forEachChild`, `SyntaxKind`, the `is*`
// guards) moved to explicitly UNSTABLE subpaths (`typescript/unstable/ast`). This module does not
// COMPILE anything — it parses our own source to locate proof bindings — so it pins TypeScript
// 5.7's stable compiler API as a parsing library under the `typescript5` alias rather than taking
// a dependency on an API upstream labels unstable. Typechecking everywhere is native `tsc@7`.
import ts from "typescript5";

// ADR-0126's OWN title reader, shared rather than cloned — `findVacuousProof` joins these names
// against `extractVouchingTestNames`'s output, so the two must spell a title identically (see
// `declaredName`). Both packages resolve the same `typescript`, so the AST nodes are interchangeable.
import { readTestCallTitle } from "@storytree/orchestrator";

// TYPE-ONLY, and deliberately so: the attribution core imports `DecayFinding` from here, so a value
// import either way would be a cycle. Attribution decides WHO a located signal belongs to; this file
// decides WHAT is located and what a backlog costs. Neither owns the other.
import type { DecayAttribution, DecayOwner } from "./decay-attribution.js";

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
  /**
   * EVERY repo-relative file whose content produced this finding, when that is more than {@link where}
   * alone. Attribution (ADR-0301) charges a finding to this branch when the branch touched ANY basis
   * file, so a finding that rests on two files and declares only one is a signal that can be created
   * by an edit and read as somebody else's — the wrongly-excused direction.
   *
   * ABSENT means "just {@link where}", which is the honest default for the instruments whose finding
   * is a property of one file. It does NOT extend to inputs an instrument CROSS-references across the
   * whole repo (a symbol table, a workspace manifest): those cannot be a per-finding file list, and are
   * handled by the shell's cross-input guard instead.
   */
  basis?: readonly string[];
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
 * PURE: assert that a fact loader actually OBSERVED something, and throw — loudly, into
 * {@link runDecaySweep}'s escalation path — when it did not.
 *
 * THE RULE IT NAMES: **an empty enumeration is a BLIND instrument, never a clean one.** Every
 * instrument here judges facts that a loader enumerated from disk, and every one of them is
 * subtractive: findings can only come from facts. So a loader that returns nothing produces zero
 * findings, and zero findings is exactly what a healthy repo produces. The two are indistinguishable
 * at the point where it matters, and the sweep's own report resolves the ambiguity the wrong way —
 * it prints a SMALLER located count, "every instrument within its own drain ceiling", "chartered
 * coverage 4/4 … are sweeping", and exits 0. A broken enumeration reads as a cleaner repo.
 *
 * WHY THIS IS A NAMED HELPER AND NOT A FOURTH HAND-WRITTEN `if`. It was three hand-written ones, and
 * the fourth was missing: `loadProofBindings` had no guard while `loadSurfaceRoutes`,
 * `loadTestFileFacts`, and `loadGateChecks` all had theirs. Measured on the pre-change code by
 * blinding each loader in turn against the REAL check — same failure, opposite verdicts:
 *
 * - blinding a GUARDED loader → `ESCALATED — 1 signal(s) past the escalation line`, exit 1.
 * - blinding `loadProofBindings` → `WARN — 23 located signal(s), every instrument within its own
 *   drain ceiling`, `chartered coverage: 4/4 … are sweeping`, exit **0** — with
 *   `contract-binding-drift` having read zero specs, and its whole section absent from the report.
 *
 * That is the can-never-go-red class this arc exists to fence, occurring inside the backstop built to
 * fence it — and it was invisible precisely because the guard was a convention repeated at each site
 * rather than a rule with a name. It is still a convention (nothing MECHANICALLY forces a new loader
 * to call this), which is stated rather than glossed; what changes is that the rule now has one
 * spelling, one place to read why, and a visible absence.
 *
 * COUNT WHAT WAS OBSERVED, NOT WHAT WAS FOUND. `observed` is the size of the ENUMERATION — spec files
 * parsed, routes dispatched, test files read — never the number of findings. An instrument that read
 * 400 specs and found nothing wrong is healthy and must stay silent; only one that read nothing at all
 * has proved nothing. Passing a finding count here would red the gate on exactly the repo state the
 * sweep exists to certify.
 */
export function requireObserved(observed: number, what: string): void {
  if (observed === 0) {
    throw new Error(`${what} — the enumeration observed nothing, so this instrument proved nothing`);
  }
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
  // The FIFTH, chartered by ADR-0278 (which amends ADR-0252 D1's four). ADR-0252's own 2026-08-01
  // correction anticipated exactly this: it scoped rather than removed the `NOT swept:` reporting
  // because "a fifth instrument would make it reachable again". The denominator is read from THIS
  // list, so adding a member is the whole change — no prose anywhere states the number.
  "unproven-seam-default",
  // The SIXTH, chartered by ADR-0424 D5, which puts grounded-claim drift into this family rather
  // than behind a rung of its own. It is the first member whose subject is the LIBRARY tier instead
  // of the repo's source — an accepted decision whose anchored code moved — and therefore the first
  // that dials the store; see `check-verification-decay.ts`'s header for what that changed.
  "decision-source-drift",
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
  /**
   * Did this repo-relative path EVER exist in this branch's history? Injected for the same reason
   * as {@link exists}, and backed by git at the caller.
   *
   * WHY THIS EXISTS AT ALL. A missing path INSIDE a workspace package is exempt below, and that
   * exemption is correct: a genuine net-new unit legitimately binds a file it is about to create,
   * and flagging those would red every honest new spec. But the exemption made two DIFFERENT
   * situations produce one identical reading — a suite that was RENAMED and a suite that was never
   * written are both "missing, inside a package" — so the renamed case never resolved and sat in
   * the not-yet-built pile forever. Current-tree facts cannot separate them by construction; only
   * history can, which is why this is a second probe rather than a cleverer predicate over
   * {@link exists}.
   *
   * ONLY EVER CONSULTED for a path the workspace says is missing, so it costs nothing on the
   * common path.
   */
  everExisted: (repoRelPath: string) => boolean;
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
/**
 * What a binding's target IS, once the workspace and its history have both been asked.
 *
 * `pending` is the one verdict that is NOT a finding: a net-new unit binding a file it is about to
 * create. Keeping it a named verdict rather than a `false` is the point — the bug this classifier
 * fixes was that `pending` and `renamed` were the same answer.
 */
export type TargetVerdict = "live" | "dead" | "renamed" | "pending";

/**
 * PURE: classify one bound target against the workspace as it is, and — only when the workspace
 * says the path is missing — against the branch's history.
 *
 * THE DISCRIMINATION THIS EXISTS FOR. A missing path inside a workspace package used to return a
 * flat "not dead", which collapsed two different situations into one reading: a suite that was
 * RENAMED (its binding now names a path that stopped existing) and a suite that was never written
 * (a net-new unit naming a path that has not existed yet). Both read as pending work, so the
 * renamed case never resolved — and on a `--real` rebuild the leaf would AUTHOR the file the stale
 * path names, producing a second suite beside the real one.
 *
 * THE EXEMPTION IS PRESERVED EXACTLY, which is the constraint that shaped this. `pending` still
 * yields no finding, so a genuine net-new unit is untouched. Nothing here widens what is reported
 * on the honest path; the history probe only ever SPLITS the population that was already exempt.
 */
export function classifyTarget(target: BoundTarget, workspace: WorkspaceFacts): TargetVerdict {
  if (target.kind === "package") {
    return workspace.packageNames.has(target.value) ? "live" : "dead";
  }
  if (workspace.exists(target.value)) return "live";
  if (!workspace.packageDirs.some((dir) => isInsideDir(target.value, dir))) return "dead";
  return workspace.everExisted(target.value) ? "renamed" : "pending";
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
 *
 * TWO REPAIRS, NOT ONE, since the renamed/never-written split landed. A `dead` target names a place
 * the code was never or is no longer housed — re-bind the node or retire it. A `renamed` target
 * names a path that HAS history and no longer resolves — the suite moved, so re-point the binding
 * at where it moved to. They are reported with different phrases because they are different
 * repairs, and a reader who cannot tell them apart will do the wrong one: re-authoring a suite that
 * already exists under another name is the ADR-0085 / ADR-0097 proof-theater shape.
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
      const verdict = classifyTarget(target, workspace);
      if (verdict === "live" || verdict === "pending") continue;
      const phrase =
        verdict === "renamed"
          ? `${target.role} binds \`${target.value}\` (missing, but this path HAS history — the suite was renamed or deleted, so re-point the binding; a \`--real\` rebuild would author a second suite here)`
          : target.kind === "package"
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
      // BOTH halves of the pair, because a pair is created by whichever surface dispatched the route
      // SECOND — and `where` names only the mirror. A branch that adds the studio half of a route the
      // desktop already served has authored this finding while touching no desktop file (ADR-0301).
      basis: referenceFile === "(unknown)" ? [mirrorFile] : [mirrorFile, referenceFile],
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
// Instrument: vacuous proof (ADR-0252 D1, the third named cheap check)
// ---------------------------------------------------------------------------

/**
 * One test file, projected to the two facts this instrument compares.
 *
 * The second set is READ FROM THE REPO'S OWN CLASSIFIER rather than re-derived, and that is the whole
 * design: the finding is precisely *the classifier cannot see this*, so re-implementing "substantive
 * assertion" here would make the instrument compare its own opinion against itself and answer a
 * different question than the one that matters. Same discipline as `mirror-pair-drift` deriving its
 * coverage from the real `MIRRORS` registry instead of a hand-kept second list.
 */
export interface TestFileFacts {
  /** Repo-relative path of the test file — where the repair is made. */
  path: string;
  /**
   * Declarations carrying an OPTIONS-FORM skip/todo — `test(name, { skip: !DB }, fn)` — as declared
   * name → the skip expression verbatim, so the report quotes back what gates the test. A literal
   * `skip: false` never appears here: it skips nothing.
   */
  optionsSkipped: ReadonlyMap<string, string>;
  /**
   * The names `analyzeObservedTests` (ADR-0126, the classifier `check:coverage` reads) reports as
   * VOUCHING — running AND substantively asserting.
   */
  vouching: ReadonlySet<string>;
}

export const VACUOUS_PROOF = "vacuous-proof";

/** The test/suite call roots whose second argument may be an options object (mirrors ADR-0126). */
const TEST_CALL_ROOTS = new Set(["describe", "test", "it"]);
/** Options keys that mean "this declaration does not execute". */
const SKIP_OPTION_KEYS = new Set(["skip", "todo"]);

/**
 * The leftmost root identifier of a call's callee — `test` for `test(…)`, `describe` for
 * `describe.each([…])(…)`. Enough to recognise a test declaration; the full member walk ADR-0126 does
 * is unnecessary because this rule reads the OPTIONS argument, never a modifier.
 */
function calleeRoot(expr: ts.Expression): string | undefined {
  let node: ts.Expression = expr;
  for (;;) {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) node = node.expression;
    else if (ts.isCallExpression(node)) node = node.expression;
    else if (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
    else break;
  }
  return ts.isIdentifier(node) ? node.text : undefined;
}

/**
 * The name a declaration declares — DELEGATED to ADR-0126's own reader (`readTestCallTitle`), never
 * re-implemented. These names are JOINED against `extractVouchingTestNames`'s output, so a different
 * spelling here would silently fail to match and the instrument would under-report while still
 * looking healthy. This used to be a hand-kept COPY carrying that warning in a comment; the warning
 * came true on 2026-08-06, when teaching the classifier to fold `+`-concatenated titles would have
 * left the copy behind. Sharing the function makes the agreement structural instead of remembered.
 *
 * A title with NO readable static text reads `null` here, exactly as the copy did: an unnamed
 * declaration cannot join against anything, so it contributes no finding either way.
 */
function declaredName(arg: ts.Expression | undefined): string | null {
  const title = readTestCallTitle(arg);
  return title !== null && title.text.length > 0 ? title.text : null;
}

/**
 * PURE: every OPTIONS-FORM skip declared in one test file's SOURCE — `test(name, { skip: <expr> }, fn)`
 * — as declared name → the skip property verbatim, so the report quotes back what gates the test.
 * Static: it reads the source, never executes it. An unparseable file yields no entries (fail-closed
 * toward silence here, and the empty-corpus case is caught by the caller's enumeration).
 *
 * A literal `skip: false` / `todo: false` is EXCLUDED, and that exclusion is load-bearing rather than
 * tidiness: `nvidia-trellis.test.ts` writes `skip: liveEnabled ? false : "credential-gated: …"`, so in
 * this corpus the value is an expression far more often than a bare `true`. Treating the mere presence
 * of the key as a skip would flag a test that always runs — a false positive in an instrument whose
 * whole claim is that it reports only what it can defend.
 */
export function findOptionsFormSkips(source: string, filePath: string): Map<string, string> {
  const found = new Map<string, string>();
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const root = calleeRoot(node.expression);
      const options = node.arguments[1];
      const name = declaredName(node.arguments[0]);
      if (
        root !== undefined &&
        TEST_CALL_ROOTS.has(root) &&
        name !== null &&
        options !== undefined &&
        ts.isObjectLiteralExpression(options)
      ) {
        for (const prop of options.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          const key =
            ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name) ? prop.name.text : undefined;
          if (key === undefined || !SKIP_OPTION_KEYS.has(key)) continue;
          if (prop.initializer.kind === ts.SyntaxKind.FalseKeyword) continue; // skips nothing
          if (!found.has(name)) found.set(name, prop.getText(sf).replace(/\s+/g, " "));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * PURE: locate tests that are SKIPPED IN A FORM THIS REPO'S OWN SKIP DETECTION CANNOT SEE, while
 * carrying a substantive assertion — so every static observer reads them as running and asserting.
 *
 * THE CLASS, and it is this arc's founding one (ADR-0211 / ADR-0249): *a proof that cannot fail is not
 * a proof.* A test that never executes cannot fail. The defect is not the skip — a `.live.test.ts`
 * that needs a real database SHOULD skip offline — it is that the skip is INVISIBLE, so a proof that
 * did not run is indistinguishable from one that did.
 *
 * WHY THE INVISIBILITY IS MECHANICAL, not speculative. `analyzeObservedTests` derives `skipped` from
 * the `.skip`/`.todo` MODIFIER on the call (`test.skip(name, fn)`). `node:test` also accepts the
 * OPTIONS form — `test(name, { skip: true }, fn)`, `describe(name, { skip: !DB }, fn)` — which is a
 * second argument, not a modifier, and the classifier does not read it. Such a test therefore reports
 * `skipped: false`; if its body asserts, it reports `vouches: true`. Running and asserting, to every
 * static reader in the repo. It never runs.
 *
 * MEASURED, NOT REASONED — the class is live in this repo today. `stories/wisp-as-story-claim/
 * claim-store-work-time.md` declares the contract `release-claims-by-branch-clears-the-branch`; its
 * only test is `test("release-claims-by-branch-clears-the-branch: …", { skip: !DB }, …)` in
 * `packages/notice-board/src/store/claim-store-release-by-branch.live.test.ts`. Run `pnpm
 * check:coverage` with `STORYTREE_DB_LIVE` unset — the default for the whole offline gate and for CI —
 * and it prints `claim-store-work-time: 2/3 uncovered`, naming the OTHER two. That contract reads
 * COVERED, and the proof it is covered by did not execute.
 *
 * ⚠ THE `2/3` IS THE MEASUREMENT AS TAKEN, and its two SIBLINGS have since been credited — the sweep
 * now reports this capability fully covered (ADR-0353's coverage surface reached contract 2 on
 * 2026-08-12, and contract 3 on 2026-08-13 once its `asserts —` clause was rewritten to the post-
 * ADR-0346-D3 behaviour). Read the fraction as of its date; do NOT re-derive it from
 * `pnpm check:coverage`, which ADR-0311 D2 retired. WHAT IS UNCHANGED IS THE FINDING, and it is the
 * only part this paragraph is evidence for: `release-claims-by-branch-clears-the-branch` is STILL
 * credited by a `{ skip: !DB }` test that does not execute offline. The capability reading 3/3 covered
 * rather than 1/3 makes the invisibility worse, not better.
 *
 * ONE FINDING PER FILE, listing the tests. The ceiling counts REPAIRS, and the repair is the file's
 * live-gating IDIOM, not each test: `claim-store-grades.live.test.ts` has four such tests and one fix
 * between them. (`store.test.ts` already shows the visible idiom — `if (LIVE) { suite() } else {
 * test(…, { skip: true }, () => {}) }` — an empty placeholder that asserts nothing, so no observer can
 * mistake it for a proof.) Counting mentions would let a single file consume four units of a budget
 * meant to measure backlog — the granularity #949 settled.
 *
 * THE BOUNDARY, and it is the same complement `mirror-pair-drift` sits on. `check:coverage` CONSUMES
 * `analyzeObservedTests`; this instrument locates the blind spot in that classifier's input. It does
 * not re-derive coverage, does not judge whether a contract is proven, and is silent on every test the
 * classifier can already see is skipped — a `.skip` modifier is visible, so it is not this class.
 *
 * THE FALSE-POSITIVE SURFACE, stated rather than implied. The two OBSERVATIONS are mechanically
 * certain; the CONSEQUENCE is not, and that is what keeps this advisory:
 *
 * - **An invisible skip only misleads something if something reads it.** A skipped test whose name
 *   matches no declared contract makes nothing read covered — invisible, but harmless today. This rule
 *   deliberately does NOT check the story corpus for a matching contract: the invisibility is the
 *   durable property, while the contract link is incidental and can arrive later, and reaching into
 *   `check:coverage`'s registered-`real.testFile` scope is exactly the re-derivation the boundary
 *   above forbids. So it over-reports here, on purpose.
 * - **Skipping offline is usually CORRECT.** Most of these are live-DB tests that cannot run without a
 *   database. The finding is never "this should not skip" — only that nothing can tell that it did.
 *
 * AND ITS BLIND SPOTS, for the same reason (the arc's no-silent-caps rule): an IMPERATIVE runtime skip
 * inside the body (`t.skip("git not available")`) is invisible to this rule as well as to the
 * classifier, and a `skip` value built somewhere other than the options literal is not read. It
 * under-reports there rather than over-reporting.
 */
export function findVacuousProof(files: readonly TestFileFacts[]): DecayFinding[] {
  const findings: DecayFinding[] = [];
  // Sorted so the report — and the ceiling's view of the backlog — is stable run to run.
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const hidden = [...file.optionsSkipped.entries()].filter(([name]) => file.vouching.has(name));
    if (hidden.length === 0) continue;
    const quoted = hidden.map(([name, expr]) => `"${name}" (\`${expr}\`)`);
    findings.push({
      instrument: VACUOUS_PROOF,
      id: `${VACUOUS_PROOF}:${file.path}`,
      where: file.path,
      // AN OBSERVATION, NOT A VERDICT. Two mechanical facts stated side by side: the declaration
      // carries an options-form skip, and the repo's own classifier reports that same name as running
      // and substantively asserting. It does NOT say the skip is wrong, and it does NOT say any
      // contract is falsely covered — whether anything is misled depends on the story corpus, which is
      // the adversarial pass's question, not this one's.
      detail:
        `${hidden.length} test(s) declare an OPTIONS-FORM skip that \`analyzeObservedTests\` — the ` +
        "classifier `check:coverage` reads — does not parse, and it reports the same names as running " +
        `and substantively asserting: ${quoted.join("; ")}. No static observer in this repo ` +
        "distinguishes them from tests that execute",
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Instrument: warn-list hygiene (ADR-0252 D1, the first named cheap check)
// ---------------------------------------------------------------------------

/** One source file behind a gate check — its entry, or a local module the entry imports. */
export interface GateCheckSource {
  /** Repo-relative, forward-slashed. */
  path: string;
  /** The file's text. */
  text: string;
}

/**
 * One `check:*` script wired into `pnpm gate`, projected to the sources that PRODUCE ITS OUTPUT.
 *
 * The set is the entry plus the local modules it imports, because this repo's advisory checks are
 * split entrypoint/judge — `check-coverage.ts` prints, and `coverage-gate.ts` builds every line. A
 * rule that read only the entry would see no output at all in exactly the checks that matter.
 */
export interface GateCheckFacts {
  /** The npm script name as the `gate` script spells it, e.g. `check:coverage`. */
  script: string;
  /** Repo-relative entry file — where a ceiling would be declared, so where the report points. */
  entryFile: string;
  /** Entry + one hop of local imports: everything that builds this check's printed output. */
  sources: readonly GateCheckSource[];
}

/** What the source says about one gate check's advisory shape. */
export interface WarnListShape {
  /** Some printed literal carries a `WARN` level — the check is advisory, not merely chatty. */
  warns: boolean;
  /** Some source sets a NON-ZERO exit code: this check CAN fail, so something bounds it. */
  canFail: boolean;
  /**
   * Evidence that the printed output's SIZE tracks a collection, one phrase per witness. Empty means
   * the output is a fixed number of lines about a single fact — nothing that can accumulate.
   */
  witnesses: readonly string[];
}

export const WARN_LIST_HYGIENE = "warn-list-hygiene";

/** A printed line, recognised by the `${TAG}` / `[check:` prefix every check in this repo uses. */
const OUTPUT_LITERAL = /\$\{TAG\}|\[check:/;
/** An interpolated item COUNT — the check stating, in its own output, how many things it found. */
const COUNT_INTERPOLATION = /\$\{[^}]*\.(?:length|size)\b/;
/** Array methods that iterate a collection, alongside `for…of`. */
const LOOPING_METHODS = new Set(["forEach", "map", "flatMap"]);

/** The literal's own source text, or `undefined` for anything that is not a string/template. */
function literalText(node: ts.Node, sf: ts.SourceFile): string | undefined {
  if (ts.isTemplateExpression(node) || ts.isStringLiteralLike(node)) return node.getText(sf);
  return undefined;
}

/** Is this expression the numeric literal `0` (an exit code that does NOT fail)? */
function isZeroLiteral(node: ts.Expression): boolean {
  return ts.isNumericLiteral(node) && node.text === "0";
}

/**
 * PURE: read one gate check's advisory shape out of its sources.
 *
 * Every fact is taken from the AST rather than from raw text, and that is load-bearing rather than
 * fastidious: `adr-health.ts` contains the exact string `WARN —` in a COMMENT, so a text scan would
 * call a blocking check advisory. Only a printed LITERAL counts.
 *
 * TWO INDEPENDENT WITNESSES of the same property — the printed output's size tracks a collection —
 * and either alone is sufficient, because this repo writes worklists both ways. A check may state the
 * count on its headline and join the items onto one line (`check:corpus-sync`), or emit one line per
 * item with no count anywhere (`check:surface-coverage`). Requiring BOTH was measured against the
 * corpus and drops four genuine worklists; requiring EITHER keeps them and still excludes every
 * single-fact WARN.
 */
export function analyzeGateCheck(sources: readonly GateCheckSource[]): WarnListShape {
  let warns = false;
  let canFail = false;
  const witnesses: string[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (!source.path.endsWith(".ts") && !source.path.endsWith(".tsx")) continue;
    const sf = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true);
    let loopDepth = 0;

    const visit = (node: ts.Node): void => {
      // --- the level: a printed literal carrying WARN ---
      const text = literalText(node, sf);
      if (text !== undefined && /WARN/.test(text)) warns = true;

      // --- the bound: any non-zero exit anywhere in the implementation ---
      if (ts.isCallExpression(node) && node.expression.getText(sf) === "process.exit") {
        const arg = node.arguments[0];
        if (arg === undefined || !isZeroLiteral(arg)) canFail = true;
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        node.left.getText(sf) === "process.exitCode" &&
        !isZeroLiteral(node.right)
      ) {
        canFail = true;
      }

      // --- witness 1: a printed line states an item COUNT ---
      if (text !== undefined && OUTPUT_LITERAL.test(text) && COUNT_INTERPOLATION.test(text)) {
        const phrase = `a printed line states an item COUNT (${source.path})`;
        if (!seen.has(phrase)) {
          seen.add(phrase);
          witnesses.push(phrase);
        }
      }

      // --- witness 2: a printed line is emitted PER ITEM of a collection ---
      const isLoop =
        ts.isForOfStatement(node) ||
        (ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          LOOPING_METHODS.has(node.expression.name.text));
      if (isLoop) loopDepth++;
      if (loopDepth > 0 && ts.isCallExpression(node)) {
        const arg = node.arguments[0];
        const argText = arg === undefined ? undefined : literalText(arg, sf);
        if (argText !== undefined && OUTPUT_LITERAL.test(argText)) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          const phrase = `a printed line is emitted PER ITEM of a collection (${source.path}:${line})`;
          if (!seen.has(phrase)) {
            seen.add(phrase);
            witnesses.push(phrase);
          }
        }
      }

      ts.forEachChild(node, visit);
      if (isLoop) loopDepth--;
    };
    visit(sf);
  }

  return { warns, canFail, witnesses };
}

/**
 * PURE: locate advisory gate checks that print a per-item WORKLIST which no size can ever fail.
 *
 * THE CLASS, and it is the one ADR-0252 D1 named this instrument for. The arc's own guardrail is *an
 * advisory list stays readable or stops being advisory*, and the ADR names the live counter-example
 * outright: `check:coverage` "already carries a 121-contract WARN backlog with known noise in it". An
 * unbounded advisory list is this shape's KNOWN failure mode, not a hypothetical one — the channel
 * accumulates until readers stop reading it, and then a real signal arriving in it is indistinguishable
 * from the noise it arrives beside.
 *
 * THE RULE IS THE CONJUNCTION, and all three halves are load-bearing:
 *
 * - **It WARNs** — the output carries an advisory level, so it is a channel a reader is expected to
 *   read, not silent bookkeeping.
 * - **No source sets a non-zero exit** — there is no path by which the list's SIZE fails anything. This
 *   is what excludes every check that has bound its worklist: `check:friction-drain` (ADR-0168 D4) and
 *   this sweep itself when the rule was written, and since 2026-07-28 the six it located as well, each
 *   now comparing a count to a ceiling and exiting 1. Draining the instrument is exactly this exclusion
 *   being earned one check at a time — it is not a list of permanent exemptions.
 * - **The printed output's size tracks a COLLECTION** — the tightening that carries the measurement.
 *   Without it the rule flags `check:node-version`, `check:dist-drift` and `check:deploy-health`, whose
 *   WARN reports ONE fact (the Node version, the published installer hash, the newest deploy run).
 *   Nothing there can accumulate, so a ceiling would be ceremony. Measured: 9 signals without this
 *   half, 6 with it, and the 3 it removes are exactly those three.
 *
 * ONE FINDING PER CHECK. The repair is per-check — give that worklist a bound, or establish it needs
 * none — so the ceiling counts repairs, not printed lines (the granularity #949 settled).
 *
 * THE FALSE-POSITIVE SURFACE, stated rather than implied, because this LOCATES and never adjudicates:
 *
 * - **A worklist that is a DRIFT between two surfaces drains with one idempotent command** and may need
 *   no ceiling at all. Whether such a list can accumulate is a judgment about the REMEDY, which only an
 *   adversarial pass makes — and when that pass was actually run against the two candidates
 *   (`check:agents-sync`, `check:corpus-sync`, 2026-07-28) the false positive did NOT hold: both had
 *   demonstrably printed multi-item worklists while exiting 0, because nothing schedules the drain, and
 *   both were bounded (`sync-drain.ts`). The clause stays, because the reasoning is still the right
 *   reasoning; what it no longer carries is a standing example.
 * - **SIZE is what makes a list unreadable, and this rule cannot see size.** It reads source, not a
 *   run, so a two-item worklist and a 121-item one are indistinguishable here. `check:surface-coverage`
 *   lists 1 item today. The finding is never "this list is too long" — only that no size fails.
 *
 * AND ITS BLIND SPOTS, for the same reason (the arc's no-silent-caps rule) — it under-reports rather
 * than over-reports at each:
 *
 * - A check whose output is rendered more than ONE local import away, or in another workspace package,
 *   is invisible to the source projection.
 * - A check that mixes a BLOCKING rule with an advisory worklist reads as bounded, because the exit
 *   path exists somewhere in the file — `check:boundaries` is exactly that shape.
 * - Gate steps that are not `check:*` scripts (`pnpm -r test`, `pnpm -r typecheck`) are not read.
 */
export function findWarnListHygiene(checks: readonly GateCheckFacts[]): DecayFinding[] {
  const findings: DecayFinding[] = [];
  // Sorted so the report — and the ceiling's view of the backlog — is stable run to run.
  for (const check of [...checks].sort((a, b) => a.script.localeCompare(b.script))) {
    const shape = analyzeGateCheck(check.sources);
    if (!shape.warns || shape.canFail || shape.witnesses.length === 0) continue;
    findings.push({
      instrument: WARN_LIST_HYGIENE,
      id: `${WARN_LIST_HYGIENE}:${check.script}`,
      where: check.entryFile,
      // EVERY source the shape was read from, not just the entry. This repo splits an advisory check
      // entrypoint/judge and the exit path lives in the JUDGE, so removing a ceiling from a sibling
      // module creates this finding with the entry file untouched (ADR-0301). That is precisely the
      // wrongly-excused shape, and it is not hypothetical: `graduation-drain.ts` is such a sibling.
      basis: check.sources.map((s) => s.path),
      // AN OBSERVATION, NOT A VERDICT. Three mechanical facts stated side by side: the check prints a
      // WARN, its printed output's size tracks a collection, and nothing in its implementation sets a
      // non-zero exit. It does NOT say the list is too long, does not say it has rotted, and does not
      // say it needs a ceiling — whether this worklist can accumulate at all depends on its remedy,
      // which is the adversarial pass's question, not this one's.
      detail:
        `\`${check.script}\` prints an advisory WARN worklist whose printed size tracks a collection ` +
        `(${shape.witnesses.join("; ")}), and no source implementing it sets a non-zero exit code — ` +
        "so no size that list reaches fails anything",
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Seam-default facts (the unproven-seam-default facts, ADR-0278)
// ---------------------------------------------------------------------------

/**
 * One source file's SEAM DEFAULTS — the symbols wired as the fallback used when no fake is injected.
 *
 * Keyed on the WIRING and never on the name. The repo's `default*` / `builtin*` convention is only a
 * convention: it both over-includes (`defaultScript` is a data constant) and under-includes (nothing
 * obliges a seam default to be named at all), so a name-keyed aperture would measure the convention
 * rather than the hazard. What identifies a seam default is its POSITION — the value a call falls
 * through to when the caller injects nothing.
 */
export interface SeamDefaultFacts {
  /** Repo-relative path of the file declaring them — where the repair is made. */
  path: string;
  /**
   * Fallback symbol → the local symbols it wires, when the default is an object literal seam
   * (`{ statMtimeMs: defaultStatMtimeMs, … }`). EMPTY for a plain function default. The arms are
   * carried so the finding can name what a drain has to reach; they are never counted separately,
   * because covering the object is what covers them.
   */
  defaults: ReadonlyMap<string, readonly string[]>;
}

export const UNPROVEN_SEAM_DEFAULT = "unproven-seam-default";

/**
 * THE APERTURE (ADR-0278 D4 leaves this to the build, as ADR-0252's "Not decided here" assigns it).
 *
 * A seam default is recognised by its WIRING POSITION — the value a call falls through to when the
 * caller injects nothing — never by its name. Two forms carry that meaning in this repo, and both are
 * matched:
 *
 *   `const io = deps.io ?? defaultWorktreeIo;`        the nullish fallback (worktree.ts, branch.ts)
 *   `io: WallInstallIo = defaultWallInstallIo,`       the parameter default (write-authority-install.ts)
 *
 * DELIBERATELY EXCLUDED: the `default*` / `builtin*` NAMING convention. It both over-includes
 * (`defaultScript` is a data constant, `defaultSecretsFile` is path arithmetic) and under-includes —
 * nothing obliges a seam default to be named at all — so it would measure the convention rather than
 * the hazard. A hand-run name-keyed probe on 2026-08-01 was wrong about `defaultWorktreeIo` and
 * `builtinRealpath`, both of which WERE covered. (`builtinRealpath` lived in
 * `packages/drive/src/write-authority.ts`, deleted by ADR-0284 D2; the probe result stands as the
 * reason the naming convention is excluded, and does not depend on the symbol still existing.)
 */
const NULLISH_FALLBACK = /\?\?\s*([A-Za-z_$][\w$]*)/g;
const PARAM_DEFAULT = /^\s*[A-Za-z_$][\w$]*\s*:\s*[^=;()]+?\s*=\s*([A-Za-z_$][\w$]*)\s*,?$/gm;
const FUNCTION_DECL = /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm;
const CONST_DECL = /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+?)?\s*=\s*/gm;

/**
 * The local symbols that are IMPLEMENTATIONS — callable, or an object literal of callables.
 *
 * THIS IS THE APERTURE'S PRECISION, and it was earned rather than assumed. The first sweep filtered
 * only on "declared locally in this file", and located 46 — but a third of those were scalar DEFAULT
 * VALUES, not seam implementations: `maxTurns = DEFAULT_MAX_TURNS`, `actor = DEFAULT_ACTOR`,
 * `tolerance = DEFAULT_TOLERANCE`, `names = SURNAMES`. Those share the syntactic position and none of
 * the hazard — a number has no unproven behaviour, and "no test names the constant 16" is not a
 * verification gap. The rule that separates them is the one the ADR states: a seam default is the
 * value a CALL falls through to, so it has to be callable, or a surface of callables.
 *
 * Computed in two passes because the object case depends on the callable case: an object literal is a
 * seam only when at least one of its members is itself an implementation (`{ statMtimeMs:
 * defaultStatMtimeMs, … }`) or an inline function. An empty or all-scalar object (`EMPTY_KEYS = {}`)
 * is data.
 */
function localImplementations(source: string): Set<string> {
  const callables = new Set<string>();
  for (const m of source.matchAll(FUNCTION_DECL)) if (m[1] !== undefined) callables.add(m[1]);

  const objectBodies = new Map<string, string>();
  for (const m of source.matchAll(CONST_DECL)) {
    const name = m[1];
    if (name === undefined || m.index === undefined) continue;
    const start = m.index + m[0].length;
    // A short window is enough to CLASSIFY the right-hand side; it is NOT enough to read an object
    // seam's members, so the object arm re-slices to the literal's real `\n};` terminator below.
    // Capping it at a fixed width silently dropped `defaultWorktreeIo` and `defaultWorktreeCreateIo`
    // — the two instances ADR-0278 names as canonical — because their members sit past it. An
    // under-report is the dangerous direction for this instrument: it prints a smaller, greener
    // number over a sweep that looked at less.
    const head = source.slice(start, start + 400);
    if (/^(?:async\s+)?function\b/.test(head) || (head.split(";")[0] ?? "").includes("=>")) {
      callables.add(name);
    } else if (head.startsWith("{")) {
      const end = source.indexOf("\n};", start);
      objectBodies.set(name, end === -1 ? head : source.slice(start, end));
    }
  }

  for (const [name, body] of objectBodies) {
    const wiresCallable = [...body.matchAll(/[A-Za-z_$][\w$]*\s*:\s*([A-Za-z_$][\w$]*)\s*[,\n]/g)].some(
      (m) => m[1] !== undefined && callables.has(m[1]),
    );
    if (wiresCallable || body.includes("=>")) callables.add(name);
  }
  return callables;
}

/**
 * The local implementations an object-literal seam wires (`{ statMtimeMs: defaultStatMtimeMs, … }`).
 *
 * Carried so a finding can NAME the arms a drain has to reach — `defaultRemoveDir`'s `win32` branch
 * is the thin instance where a default that acquired one test would still leave an arm unexercised.
 * The arms are never counted separately: covering the object is what covers them, and counting both
 * would inflate the backlog against its own ceiling.
 */
function objectArms(source: string, symbol: string, impls: ReadonlySet<string>): string[] {
  const decl = new RegExp(`\\bconst\\s+${symbol}\\b[^=]*=\\s*\\{`, "m").exec(source);
  if (decl === null) return [];
  const start = decl.index + decl[0].length;
  const end = source.indexOf("\n};", start);
  if (end === -1) return [];
  const arms = new Set<string>();
  for (const m of source.slice(start, end).matchAll(/[A-Za-z_$][\w$]*\s*:\s*([A-Za-z_$][\w$]*)\s*[,\n]/g)) {
    const value = m[1];
    if (value !== undefined && impls.has(value)) arms.add(value);
  }
  return [...arms].sort((a, b) => a.localeCompare(b));
}

/**
 * The identifiers a test file actually USES — its code with comments and string literals removed.
 *
 * THE ORACLE POISONS ITSELF WITHOUT THIS, and it was measured rather than feared. This instrument's
 * own tests name `builtinRunGit`, `defaultWorktreeCreateIo` and `defaultRemoveDir` — in a prose
 * comment and in a fixture STRING respectively — and a raw identifier scan over test files promptly
 * read all three as covered and went silent on three genuine findings. Documenting a finding must not
 * discharge it. The general form is worse than the self-inflicted case: any test whose comment
 * mentions a seam default would silently clear it, so the instrument would decay exactly where
 * someone was careful enough to explain themselves.
 *
 * COMMENTS ARE STRIPPED BEFORE STRINGS, deliberately. The reverse order is tempting (it keeps a `//`
 * inside a URL literal from truncating a line) but it lets a prose apostrophe — `don't` — open a
 * "string" that swallows real code up to the next one. Over-stripping produces FALSE POSITIVES, which
 * are noisy but safe; under-stripping produces silence, which is the failure this whole arc fences.
 * The residual cost is small and named: an identifier sitting after a `//` inside a string literal on
 * the same line is dropped.
 *
 * Still BLIND, unchanged, to a test that genuinely imports a symbol and never drives it — that one
 * reads as covered, and only the adversarial pass can tell the difference.
 */
export function codeIdentifiers(source: string): string[] {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, " ")
    .replace(/"(?:\\.|[^"\\\n])*"/g, " ")
    .replace(/'(?:\\.|[^'\\\n])*'/g, " ");
  return [...code.matchAll(/[A-Za-z_$][\w$]*/g)].map((m) => m[0]);
}

/** One file's seam defaults, or an empty map when it wires none. */
export function extractSeamDefaults(source: string): Map<string, readonly string[]> {
  const impls = localImplementations(source);

  const symbols = new Set<string>();
  for (const pattern of [NULLISH_FALLBACK, PARAM_DEFAULT]) {
    for (const m of source.matchAll(pattern)) {
      const symbol = m[1];
      // Declared HERE and an implementation: `?? []`, `?? someImport`, and `= DEFAULT_MAX_TURNS` are
      // all in the fallback position and none of them is a seam this repo leaves unproven.
      if (symbol !== undefined && impls.has(symbol)) symbols.add(symbol);
    }
  }

  const out = new Map<string, readonly string[]>();
  for (const symbol of [...symbols].sort((a, b) => a.localeCompare(b))) {
    out.set(symbol, objectArms(source, symbol, impls));
  }
  return out;
}

/**
 * Locate injected IO seams whose DEFAULT implementation is exercised by no test (ADR-0278).
 *
 * The shape, and why nothing else here sees it: injecting a seam makes the policy provable offline
 * with fixtures and, in the same move, exempts the default — the code the binary actually calls —
 * from every test that injects a fake. The suite gets GREENER the more thoroughly the seam is mocked.
 * `vacuous-proof` is the near neighbour and is structurally blind: it keys on a test that declines to
 * RUN, and here every test runs and every assertion is true, about a fake.
 *
 * AN OBSERVATION, NOT A VERDICT, in the house style of the other four. It states that a fallback
 * symbol appears in no test file. It does NOT say the default is wrong, and it does NOT say the seam
 * should not exist — some located defaults are pure path arithmetic that a real-substrate test would
 * not improve. Which of those is true is the adversarial pass's question, not this one's.
 */
export function findUnprovenSeamDefault(
  files: readonly SeamDefaultFacts[],
  testedSymbols: ReadonlySet<string>,
): DecayFinding[] {
  const findings: DecayFinding[] = [];
  // Sorted so the report — and the ceiling's view of the backlog — is stable run to run.
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    for (const symbol of [...file.defaults.keys()].sort((a, b) => a.localeCompare(b))) {
      if (testedSymbols.has(symbol)) continue;
      const arms = (file.defaults.get(symbol) ?? []).filter((arm) => !testedSymbols.has(arm));
      const armNote =
        arms.length === 0 ? "" : `, wiring ${arms.length} equally untested arm(s): ${arms.join(", ")}`;
      findings.push({
        instrument: UNPROVEN_SEAM_DEFAULT,
        // Per SYMBOL, not per file: a file may carry more than one seam, and the id must stay stable
        // across runs because the ceiling counts these.
        id: `${UNPROVEN_SEAM_DEFAULT}:${file.path}:${symbol}`,
        where: file.path,
        detail:
          `\`${symbol}\` is wired as the fallback used when no fake is injected, and its name appears ` +
          `in no test file in the repository${armNote} — so every test of this seam is evidence about ` +
          "the fakes, and the implementation that runs in production is reached by nothing",
      });
    }
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
  /**
   * How many of {@link count} this branch is answerable for (ADR-0301). Equals `count` whenever no
   * attribution was supplied or attribution could not be measured, which is why the pre-attribution
   * behaviour is the fail-closed default rather than a special case.
   */
  authored: number;
  /** How many of {@link count} rest only on files identical to the merge base. */
  inherited: number;
  /**
   * `ok` while count ≤ ceiling · `red` past it with something of the breach authored HERE · `inherited`
   * past it with NOTHING authored here — over ceiling on main, nobody's gate-run to answer for, WARN
   * with the standing drain obligation named rather than a red or a silence (ADR-0301).
   */
  level: "ok" | "red" | "inherited";
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
  /**
   * `red` when ANY instrument is over its OWN ceiling WITH something of that breach authored by this
   * branch. An instrument over its ceiling on inherited signals alone is `inherited`, never `red`
   * (ADR-0301). Says nothing about escalation.
   */
  level: "ok" | "red" | "inherited";
  /**
   * Every finding past the escalation line (ADR-0252 D1). Non-empty reds the gate on its own, at any
   * ceiling — the ceiling and the escalation are separate mechanisms with separate remedies.
   */
  escalations: readonly DecayFinding[];
  /**
   * Who each located signal is charged to (ADR-0301), when the shell measured it. ABSENT ⇒ nothing was
   * measured and every signal is charged, which is the pre-ADR-0301 behaviour and the fail-closed one.
   */
  attribution?: DecayAttribution;
}

/**
 * PURE: hold each instrument's located-region COUNT to ITS OWN ceiling, and surface escalations
 * beside them.
 *
 * Advisory per finding, fail-closed on growth (ADR-0252 D3). A ceiling is TUNED ON THAT INSTRUMENT'S
 * FIRST REAL SWEEP rather than picked in advance — set to exactly what that sweep found, so it starts
 * GREEN on an honest baseline and can only ever be tightened WITHIN A FIXED MEASUREMENT APERTURE — an
 * instrument whose aperture genuinely enlarges is re-baselined on the new population's first real
 * sweep, under ADR-0269's evidence bar (it amends ADR-0252 D3). Adding a finding without repairing one
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
  attribution?: DecayAttribution,
): DecayVerdict {
  const escalations = findings.filter((f) => f.escalation !== undefined);
  const located = findings.filter((f) => f.escalation === undefined);

  const ceilings = new Map(instruments.map((i) => [i.name, i.ceiling]));
  // Tally every declared instrument (so a clean one still reports 0/n), plus any instrument that
  // produced a finding without declaring a ceiling — held to 0 rather than silently uncounted.
  const names = [...ceilings.keys()];
  for (const f of located) if (!ceilings.has(f.instrument)) names.push(f.instrument);

  const tallies: InstrumentTally[] = names.map((name) => {
    const mine = located.filter((f) => f.instrument === name);
    const count = mine.length;
    const ceiling = ceilings.get(name) ?? 0;
    // UNATTRIBUTED IS CHARGED, and this default is the whole fail-closed posture: with no attribution
    // supplied — or a finding the classifier never saw — `authored` equals `count`, which is exactly
    // the pre-ADR-0301 behaviour. Nothing becomes inherited by omission; a signal reaches the
    // uncharged column only by an explicit, measured verdict.
    const inherited =
      attribution === undefined
        ? 0
        : mine.filter((f) => attribution.byId.get(f.id)?.owner === "inherited").length;
    const authored = count - inherited;
    // The COUNT is still what the ceiling compares — the aperture changed, not the number (ADR-0269
    // 4(f) / ADR-0301). What authorship decides is WHO the resulting breach belongs to: a breach with
    // nothing of it authored here is `inherited`, which reports and never blocks the landing.
    const level: InstrumentTally["level"] =
      count <= ceiling ? "ok" : authored > 0 ? "red" : "inherited";
    return { instrument: name, count, ceiling, authored, inherited, level };
  });

  const verdict: DecayVerdict = {
    findings,
    tallies,
    count: located.length,
    ceiling: tallies.reduce((sum, t) => sum + t.ceiling, 0),
    level: tallies.some((t) => t.level === "red")
      ? "red"
      : tallies.some((t) => t.level === "inherited")
        ? "inherited"
        : "ok",
    escalations,
  };
  if (attribution !== undefined) verdict.attribution = attribution;
  return verdict;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const TAG = "[check:verification-decay]";

export interface FormatDecaySweepResult { failed: boolean; lines: string[] }

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
): FormatDecaySweepResult {
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
    const stale = verdict.tallies.filter((t) => t.level === "inherited");
    const headline =
      verdict.level === "red"
        ? `${TAG} RED — ${verdict.count} located signal(s); ${breached.length} instrument(s) past their own drain ceiling (${coverage}).`
        : verdict.level === "inherited"
          ? `${TAG} WARN — ${verdict.count} located signal(s); ${stale.length} instrument(s) past their own drain ceiling ON MAIN, none of it authored here (${coverage}).`
          : `${TAG} WARN — ${verdict.count} located signal(s), every instrument within its own drain ceiling (${coverage}).`;
    lines.push(headline);
    lines.push(
      `${TAG}   These LOCATE regions; they do not establish defects. A metric is never itself a finding ` +
        "(ADR-0252): adversarially verify before repairing, and state the failure scenario as inputs → wrong outcome.",
    );
    // The fallback reason, printed at the top rather than buried: a reader whose gate just went red on
    // signals it never touched must be able to tell "charged because it is yours" from "charged
    // because attribution could not be measured" (ADR-0301 / ADR-0290 D7).
    if (verdict.attribution?.unattributable !== undefined) {
      lines.push(
        `${TAG}   ATTRIBUTION UNMEASURED — ${verdict.attribution.unattributable}. Every signal below is ` +
          "charged rather than excused; that is the fail-closed direction, not a claim that it is yours.",
      );
    }
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
    const flag =
      tally?.level === "red" ? " OVER CEILING" : tally?.level === "inherited" ? " OVER CEILING ON MAIN" : "";
    lines.push(`${TAG}   ${inst.name} (${score}${flag}) — ${inst.locates}`);
    // SPLIT BY AUTHORSHIP, and NOT YOURS is printed in FULL rather than summarised to a count. The
    // 15-minute differential this replaces was a session asking "which of these are mine"; a count
    // answers "how many" and leaves the reader to re-derive the rest.
    const owner = (f: DecayFinding): DecayOwner | undefined =>
      verdict.attribution?.byId.get(f.id)?.owner;
    const yours = verdict.attribution === undefined ? mine : mine.filter((f) => owner(f) !== "inherited");
    const notYours = verdict.attribution === undefined ? [] : mine.filter((f) => owner(f) === "inherited");
    if (notYours.length > 0 && yours.length > 0) lines.push(`${TAG}     YOURS (${yours.length}):`);
    for (const f of yours) lines.push(`${TAG}     · ${f.detail}  [${f.where}]`);
    if (notYours.length > 0) {
      lines.push(
        `${TAG}     NOT YOURS (${notYours.length}) — reported and NOT part of this breach; every file ` +
          "each rests on is identical to the merge base:",
      );
      for (const f of notYours) lines.push(`${TAG}     · ${f.detail}  [${f.where}]`);
    }
  }

  if (verdict.level === "red") {
    for (const t of verdict.tallies.filter((x) => x.level === "red")) {
      lines.push(
        `${TAG}   ${t.instrument}: ${t.count} located (${t.authored} yours), ceiling ${t.ceiling}. Landing is ` +
          `blocked until THIS instrument returns to ${t.ceiling} or below — repairing another ` +
          "instrument's signal cannot clear it. Repair a located signal (verify it first), or — if the " +
          "growth is legitimate and verified — raise that instrument's `ceiling` in " +
          "`packages/cli/src/check-verification-decay.ts` with the reason recorded in the commit.",
      );
    }
  }

  // THE PRE-EXISTING BREACH, named as its own outcome (ADR-0301). This is the sentence whose absence
  // cost a session ~15 minutes of stash-and-differential on 2026-08-03: the instrument is over its
  // ceiling on main, none of it is this branch's, and the remedy is the standing drain — not a raised
  // ceiling, and not a differential to prove innocence the check has already proved.
  for (const t of verdict.tallies.filter((x) => x.level === "inherited")) {
    lines.push(
      `${TAG}   ${t.instrument}: ${t.count} located, ceiling ${t.ceiling} — OVER CEILING ON MAIN, and NONE ` +
        "of it authored by this branch. Your landing is NOT blocked. This is not a red you can clear " +
        "and not one to investigate: the standing obligation is a DRAIN of this instrument (repair a " +
        "located signal, verified first), never a raised ceiling (ADR-0252 D3 / ADR-0269).",
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
  /**
   * Charge the located signals (ADR-0301). Called with the sweep's findings AFTER every instrument has
   * run, because the shell's cheap exact questions are per-finding. Omit — or let it throw — and every
   * signal is charged, which is the pre-ADR-0301 behaviour and the fail-closed one.
   */
  attribute?: (findings: readonly DecayFinding[]) => DecayAttribution,
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
  // An attributor that THROWS is fenced exactly like an instrument that throws — but it degrades to
  // CHARGING EVERYTHING rather than to an escalation, because a failure to attribute is not a failure
  // to sweep: the located regions are all still real, and the honest fallback is the behaviour that
  // predates attribution entirely (ADR-0290 D7's asymmetry — a wrongly-charged red costs a merge, a
  // wrongly-excused one lands unseen).
  let attribution: DecayAttribution | undefined;
  if (attribute !== undefined) {
    try {
      attribution = attribute(findings);
    } catch {
      attribution = undefined;
    }
  }
  return evaluateDecayCeiling(findings, instruments, attribution);
}
