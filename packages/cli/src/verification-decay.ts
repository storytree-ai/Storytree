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
 * lives in the thin {@link file://./check-verification-decay.ts} entrypoint. (A rule that parses
 * SOURCE TEXT is still pure and belongs here — {@link findOptionsFormSkips} takes a string and returns
 * facts, exactly as ADR-0126's own extractors do. What must not live here is reading a file.)
 */

import ts from "typescript";

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
 * The name a declaration declares — its first string-literal-like argument. Deliberately IDENTICAL to
 * ADR-0126's `testCallName`, including the template-with-substitutions case: these names are JOINED
 * against `extractVouchingTestNames`'s output, so a different spelling here would silently fail to
 * match and the instrument would under-report while still looking healthy.
 */
function declaredName(arg: ts.Expression | undefined): string | null {
  if (arg === undefined) return null;
  if (ts.isStringLiteralLike(arg)) return arg.text;
  if (ts.isTemplateExpression(arg)) {
    return arg.head.text + arg.templateSpans.map((s) => s.literal.text).join("");
  }
  return null;
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
 *   is what excludes the two checks that already bound their worklists: `check:friction-drain`
 *   (ADR-0168 D4) and this sweep itself, both of which compare a count to a ceiling and exit 1.
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
 * - **A worklist that is a DRIFT between two surfaces drains to zero with one idempotent command** and
 *   may need no ceiling at all — `check:agents-sync` and `check:corpus-sync` both read 0 today, and
 *   their whole remedy is a single `sync-*` invocation. Whether such a list can accumulate is a
 *   judgment about the remedy, which only an adversarial pass makes.
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
