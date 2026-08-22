/**
 * `storytree coverage --contractless [<capability-id>|<test-path>]` — the INVERSE of the
 * contract-coverage report, and the instrument ADR-0294 D2's honesty wall was missing.
 *
 * `storytree coverage <cap>` walks DECLARED CONTRACT ⇒ TEST: "does some observed test name this
 * contract?" This walks the same surface the other way, TEST ⇒ DECLARED CONTRACT: "which node claims
 * this asserted behaviour?"
 *
 * WHY THE DIRECTION MATTERS. ADR-0294 D2 lets a story-UAT criterion be deleted only when its author
 * NAMES the lower-tier node that already proves it. The author therefore starts from a running
 * assertion and needs a node — the direction coverage cannot answer. Measured on this corpus while
 * adjudicating `wisp-as-story-claim`'s legs for the D4 pass, that gap is routine rather than
 * exceptional: the behaviour is asserted in a suite the capability's own observe gate runs, and no
 * contract of that capability declares it, so the honest citation collapses to a quoted test TITLE.
 * Both surviving rationales in `stories/uat-legacy-dispositions.json` for that story say so in their
 * own text, `#uat-3` calling it out as a "CITATION CAVEAT, recorded because it will recur".
 * Establishing that by hand cost a walk of capability ⇒ declared contracts ⇒ test-file titles, three
 * levels deep, per candidate.
 *
 * WHAT A CONTRACTLESS BEHAVIOUR IS NOT. It is not a defect and not a worklist row. Most unit tests
 * are steps INSIDE a contract rather than contracts of their own, and the corpus-wide ratio makes
 * that plain — closing the gap wholesale would mean declaring roughly one contract per test, which is
 * a different (and wrong) model of what a contract is. What the report establishes is narrower and is
 * the only thing the honesty wall needs: whether a CITATION is available for this behaviour, or
 * whether an author quoting it is quoting a title nothing claims.
 *
 * Read-only and OFFLINE — it reads specs and test sources off disk and classifies in memory. No DB,
 * no `--pg`, no spend, no writes. It REPORTS and exits 0; it gates nothing, and deliberately so: a
 * ceiling over this number would price the corpus toward contract inflation, which is the failure
 * mode the paragraph above describes. Pure-by-injection (the disk walk is a seam), mirroring
 * {@link import("./coverage.js").coverageCommand}.
 */

import { classifyBehaviourClaims, type AssertedBehaviour, type ObservedTest } from "@storytree/orchestrator";

import type { Envelope } from "./envelope.js";

/** One capability's proof surface, already parsed — the report's injected input. */
export interface BehaviourClaimUnit {
  /** The capability id. */
  unitId: string;
  /** The unit's tier (for the report framing). */
  tier: string;
  /** The declared contract ids, in declared order. */
  contractIds: string[];
  /** The surface, per file: the repo-relative path and every observed test in it. */
  files: { file: string; observed: ObservedTest[] }[];
}

/** Everything the report reads, injected for offline testability (the disk walk is the seam). */
export interface BehaviourClaimDeps {
  /** Load every capability carrying a real-build proof surface AND ≥1 declared contract. */
  loadUnits: () => BehaviourClaimUnit[];
}

/** One capability's folded totals — the corpus summary's row, and the per-unit report's header. */
export interface UnitClaimTotals {
  unitId: string;
  contracts: number;
  behaviours: number;
  claimed: number;
  contractless: number;
  unreadable: number;
}

/** A target string names a test FILE rather than a capability when it looks like a path. */
export function looksLikeTestPath(target: string): boolean {
  return target.includes("/") || target.endsWith(".ts") || target.endsWith(".tsx");
}

/** PURE: fold one unit's whole surface into its claim totals. */
export function foldUnitTotals(unit: BehaviourClaimUnit): UnitClaimTotals {
  const report = classifyBehaviourClaims({
    unitId: unit.unitId,
    contractIds: unit.contractIds,
    observed: unit.files.flatMap((f) => f.observed),
  });
  return {
    unitId: unit.unitId,
    contracts: unit.contractIds.length,
    behaviours: report.claimed.length + report.contractless.length + report.unreadable.length,
    claimed: report.claimed.length,
    contractless: report.contractless.length,
    unreadable: report.unreadable.length,
  };
}

export interface FoldCorpusTotalsResult {
  units: number;
  files: number;
  behaviours: number;
  claimed: number;
  contractless: number;
  unreadable: number;
  rows: UnitClaimTotals[];
}

/**
 * PURE: the corpus-wide totals across every scanned unit.
 *
 * Behaviours are counted PER (unit, file) rather than deduplicated corpus-wide, because a test file
 * that sits in two capabilities' surfaces genuinely poses the citation question twice — once per
 * capability whose contracts might claim it. The number is therefore a count of citation questions,
 * not of distinct tests; the two differ on this corpus and conflating them would misreport both.
 */
export function foldCorpusTotals(units: readonly BehaviourClaimUnit[]): FoldCorpusTotalsResult {
  const rows = units.map(foldUnitTotals);
  const distinctFiles = new Set(units.flatMap((u) => u.files.map((f) => f.file)));
  return {
    units: units.length,
    files: distinctFiles.size,
    behaviours: rows.reduce((n, r) => n + r.behaviours, 0),
    claimed: rows.reduce((n, r) => n + r.claimed, 0),
    contractless: rows.reduce((n, r) => n + r.contractless, 0),
    unreadable: rows.reduce((n, r) => n + r.unreadable, 0),
    rows,
  };
}

/** The standing caveat, printed on every form — the report is a citation check, never a worklist. */
const NOT_A_WORKLIST = [
  "A contractless behaviour is NOT a defect. Most unit tests are steps inside a contract, not",
  "contracts of their own — declaring one contract per test is a different and wrong model. What",
  "this says is narrower: a deletion citing one of these behaviours has NO lower-tier node to name",
  "(ADR-0294 D2) and would have to quote a test title instead. Treat a row as a prompt to check the",
  "citation, never as a row to drain.",
];

/** Render one behaviour as a report line. */
function behaviourLine(marker: string, b: AssertedBehaviour, suffix: string): string {
  return `  ${marker} ${b.effectiveTitle}${suffix}`;
}

/** The whole-corpus summary (no target given). */
function corpusReport(units: readonly BehaviourClaimUnit[]): Envelope {
  const totals = foldCorpusTotals(units);
  if (totals.units === 0) {
    return {
      ok: true,
      body:
        "No capability carries both a registered real-build proof surface and a declared `## Contracts` " +
        "section — nothing to classify. (The `real:` arm is the filter: a capability with none is invisible " +
        "to this report, exactly as it is to `check:coverage`.)",
      next: ["storytree tree", "storytree coverage --totals"],
    };
  }
  const worst = [...totals.rows].sort((a, b) => b.contractless - a.contractless).slice(0, 15);
  const idWidth = Math.max(1, ...worst.map((r) => r.unitId.length));
  const lines: string[] = [
    "Behaviour claims across the corpus — which asserted behaviours does a declared contract claim?",
    "The INVERSE of `storytree coverage` (contract ⇒ test); this is test ⇒ contract (ADR-0294 D2).",
    "",
    `scanned: ${totals.units} capability(ies) with a real-build proof surface, over ${totals.files} test file(s)`,
    `asserted behaviours: ${totals.behaviours}  (${totals.claimed} claimed by a declared contract, ` +
      `${totals.contractless} CONTRACTLESS, ${totals.unreadable} unreadable)`,
    "",
    `the ${worst.length} capability(ies) with the largest citation gap:`,
    ...worst.map(
      (r) =>
        `  ${r.unitId.padEnd(idWidth)}  ${String(r.contractless).padStart(4)} contractless of ` +
        `${String(r.behaviours).padStart(4)}  (${r.contracts} declared contract(s))`,
    ),
    "",
    ...NOT_A_WORKLIST,
  ];
  if (totals.unreadable > 0) {
    lines.push(
      "",
      `⚠ ${totals.unreadable} behaviour(s) have a title this static reader could not read in full, and are`,
      "  counted apart from the contractless. A title it never saw cannot be shown to carry a contract id,",
      "  so calling those contractless would over-state the gap by the size of this checker's blind spot.",
    );
  }
  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      "storytree coverage --contractless <capability-id>",
      "storytree coverage --contractless <test-file-path>",
      "storytree coverage <capability-id>",
    ],
  };
}

/** The per-capability report. */
function unitReport(unit: BehaviourClaimUnit): Envelope {
  const report = classifyBehaviourClaims({
    unitId: unit.unitId,
    contractIds: unit.contractIds,
    observed: unit.files.flatMap((f) => f.observed),
  });
  const totals = foldUnitTotals(unit);
  const lines: string[] = [
    `Behaviour claims for "${unit.unitId}" (tier: ${unit.tier}) — test ⇒ contract (ADR-0294 D2)`,
    "",
    `declared contracts: ${totals.contracts}`,
    `surface: ${unit.files.length === 0 ? "(none on disk)" : unit.files.map((f) => f.file).join(", ")}`,
    `asserted behaviours: ${totals.behaviours}  (${totals.claimed} claimed, ${totals.contractless} ` +
      `CONTRACTLESS, ${totals.unreadable} unreadable)`,
    "",
    ...report.claimed.map((b) => behaviourLine("✓", b, `   claimed by \`${b.contractId}\``)),
    ...report.contractless.map((b) => behaviourLine("○", b, "   CONTRACTLESS — no declared contract names it")),
    ...report.unreadable.map((b) => behaviourLine("?", b, "   UNREADABLE — title not fully static")),
  ];
  if (report.contractless.length > 0) lines.push("", ...NOT_A_WORKLIST);
  return {
    ok: true,
    body: lines.join("\n"),
    next: [`storytree coverage ${unit.unitId}`, "storytree coverage --contractless"],
  };
}

/** The per-test-file report — every capability whose surface includes it, folded separately. */
function fileReport(file: string, units: readonly BehaviourClaimUnit[]): Envelope {
  const needle = file.split("\\").join("/");
  const owners = units.filter((u) => u.files.some((f) => f.file === needle || f.file.endsWith(`/${needle}`)));
  if (owners.length === 0) {
    return {
      ok: false,
      body:
        `no SCANNED capability's proof surface includes a test file matching "${file}", so this ` +
        "report cannot answer for it. That is a refusal, NOT a finding of 'claimed by nothing' — " +
        "there are two ways to reach it and they mean opposite things:\n\n" +
        "  1. No capability declares this file at all (in a `real:` arm or an ADR-0353 " +
        "`coverage.testGlobs`), so nothing claims what it asserts and an ADR-0294 D2 citation " +
        "resting on it can only quote the title.\n" +
        "  2. A capability DOES declare a contract for it, but that capability carries no `real:` " +
        "arm — the same filter `check:coverage` applies — so it is outside this report's scanned " +
        "population entirely. `render-core` is the live example: it declares eight contracts and no " +
        "`proof:` block, and ADR-0353's coverage surface is reachable only from a `proof:` block.\n\n" +
        "Telling the two apart takes one grep of the file for a contract id. Check the path first: " +
        "pass it exactly as the surface listing prints it (repo-relative, forward slashes).",
      next: ["storytree coverage --contractless", "storytree tree"],
    };
  }
  const lines: string[] = [
    `Behaviour claims for test file "${needle}" — which node claims each assertion? (ADR-0294 D2)`,
    "",
    `in the proof surface of ${owners.length} capability(ies): ${owners.map((u) => u.unitId).join(", ")}`,
  ];
  for (const unit of owners) {
    const observed = unit.files.filter((f) => f.file === needle || f.file.endsWith(`/${needle}`)).flatMap((f) => f.observed);
    const report = classifyBehaviourClaims({ unitId: unit.unitId, contractIds: unit.contractIds, observed });
    lines.push(
      "",
      `── ${unit.unitId} (${unit.contractIds.length} declared contract(s)) ` +
        `— ${report.claimed.length} claimed, ${report.contractless.length} contractless, ` +
        `${report.unreadable.length} unreadable`,
      ...report.claimed.map((b) => behaviourLine("✓", b, `   claimed by \`${b.contractId}\``)),
      ...report.contractless.map((b) => behaviourLine("○", b, "   CONTRACTLESS")),
      ...report.unreadable.map((b) => behaviourLine("?", b, "   UNREADABLE — title not fully static")),
    );
  }
  lines.push("", ...NOT_A_WORKLIST);
  return {
    ok: true,
    body: lines.join("\n"),
    next: owners.map((u) => `storytree coverage --contractless ${u.unitId}`),
  };
}

/**
 * `storytree coverage --contractless [<capability-id>|<test-path>]` — the inverse report.
 *
 * No target sweeps the corpus; a capability id classifies that unit's whole surface; anything that
 * looks like a path classifies that test file against every capability whose surface includes it,
 * which is the shape an ADR-0294 D2 author actually has in hand (a running test, needing a node).
 */
export function contractlessCommand(target: string | undefined, deps: BehaviourClaimDeps): Envelope {
  const units = deps.loadUnits();
  const wanted = target?.trim() ?? "";
  if (wanted.length === 0) return corpusReport(units);
  if (looksLikeTestPath(wanted)) return fileReport(wanted, units);
  const unit = units.find((u) => u.unitId === wanted);
  if (unit === undefined) {
    return {
      ok: false,
      body:
        `no scanned capability "${wanted}". This report scans only capabilities that carry BOTH a ` +
        "registered real-build proof surface (`proof.real.testFile`) and a declared `## Contracts` " +
        "section — the same filter `check:coverage` applies. A capability with no `real:` arm is " +
        "invisible here, which is a limit of the instrument and not a statement about that capability.",
      next: ["storytree coverage --contractless", "storytree tree"],
    };
  }
  return unitReport(unit);
}
