/**
 * The CLI command register — `cli#unified-command-dispatch`, ONE capability (ADR-0343).
 *
 * This file is large and is touched by nearly every verb the factory gains. That is a composition
 * root doing its job, not a defect in it, and **it is not to be decomposed** — see ADR-0343 D1.
 * The question has been raised and settled three times (ADR-0340 named it, ADR-0341 ranked it,
 * ADR-0342 measured it, ADR-0343 fenced it); please do not re-open it.
 *
 * The distinction that matters (ADR-0343 D2): **one unit may live in many files; many files do not
 * make many units.** Splitting code out across files is free and already normal here — this module
 * already imports 39 per-command modules. What is refused is giving those pieces separate dispatch,
 * separate argument parsing, or separate ownership in the work hierarchy. Nine stories reach their
 * verb through this one register, and one owner per path is ADR-0192's landlord rule.
 *
 * What IS permitted, and arguably owed (ADR-0343 D4): the inline library/artifact command bodies
 * below still hold domain logic, which this capability's own spec forbids — "the shim holds no
 * domain logic; every verb forwards into the organism that owns it". Moving them into the owning
 * organism is spec conformance. Do it for that reason; it buys no measurable lane width
 * (ADR-0342 D2/D3).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import type { Store, StoredDoc } from "@storytree/storage-protocol";
import {
  upcastAndValidate,
  explainDocValidationError,
  groupSources,
  CURRENT_SCHEMA_VERSION,
  KIND_SPECS,
  arrayFieldsForKind,
  knownFieldsForKind,
  stringFieldsForKind,
  NODE_REF_PREFIX,
  REPO_ROOT_ENV,
  resolveRepoRoot,
} from "@storytree/library";
import type { UatTestCriterion, ReliabilityGate } from "@storytree/library";
import {
  loadNodeSpec,
  findNodeSpecFile,
  readTestSurface,
  resolveSignerFromEnv,
  platformShellCommand,
  runShellCommand,
} from "@storytree/orchestrator";
import { renderStoredDoc, renderProcessNode } from "@storytree/library/store";

import { execFileSync } from "node:child_process";

import { adrCommand, adrHelp, type AdrAllocatorLike } from "./adr.js";
import { expandAtPathFlags, formatAtPathRefusal } from "./at-path.js";
import {
  arcCommand,
  arcHelp,
  arcNew,
  arcEdit,
  arcIncrementAdd,
  arcClose,
  arcReconcile,
  arcReopen,
  arcIncrementClose,
  arcIncrementNew,
  arcScopeOf,
  type ArcWriteDeps,
} from "./arc.js";
import { questionCommand, questionHelp, type QuestionWriteDeps } from "./question.js";
import { incrementCommand, incrementHelp, type CountCommitsSince } from "./increment.js";
import { traversalCommand, traversalHelp } from "./traversal.js";
// `session-cost` — the repeatable session-cost measurement over host transcripts (ADR-0323 D4).
import { sessionCostCommand, sessionCostHelp } from "./session-cost.js";
import { CLI_AREAS } from "./cli-areas.js";
import { dispatchCommand, dispatchHelp } from "./dispatch-command.js";
// ADR-0290: a live library write records WHICH BRANCH made it, so `check:corpus-content` can charge a
// seed↔live drift to the session that must reconcile it instead of to whoever gates next.
import { defaultCliActor } from "./cli-actor.js";
import { adoptCommand, adoptHelp, type AdoptDispatchDeps } from "./adopt.js";
import { branchNext, branchHelp } from "./branch.js";
import {
  pruneWorktrees,
  worktreeDrainStatus,
  worktreeHelp,
  DEFAULT_THRESHOLD_MS,
  type WorktreeIo,
  type PruneOptions,
} from "./worktree.js";
import type { DrainLedgerIo } from "./worktree-drain.js";
// `worktree create` — the claim-gated workspace ceremony (ADR-0200 D3).
import { createWorktree, type WorktreeCreateIo } from "./worktree-create.js";
import { writeAuthorityCommand } from "./write-authority-install.js";
import {
  desktopHelp,
  desktopInstallShortcut,
  desktopLaunch,
  type CreateShortcutsFn,
  type DesktopSpawnFn,
  type ResolveElectronFn,
} from "./desktop.js";
import { onboardingCommand, onboardingHelp } from "./onboarding.js";
import { doctorCommand, doctorHelp } from "./doctor.js";
import { guideCommand, guideHelp } from "./guide.js";
import {
  newFriction,
  migrateFriction,
  reinforceFriction,
  routeFriction,
  listFriction,
  frictionHelp,
  type FrictionContext,
} from "./friction.js";
// ADR-0316 — the report-only factory-floor health instrument (`factory-floor-health-arc`).
import { factoryHealth, factoryHelp } from "./factory.js";
import type { CommitRec } from "@storytree/drive";
import type { AdoptPlanStory } from "./adopt-plan.js";
import { coverageCommand, type CoverageUnit } from "./coverage.js";
// ADR-0317 D2 — the subtree-grain ownership map + its disk-walk totality report (report-only).
import { gatherFromDisk, ownershipCommand, ownershipHelp } from "./ownership.js";
import { agentsCommand, agentStepCommand, agentsHelp } from "./agents.js";
import { attestCommand, attestHelp, type AttestationStoreLike, type AttestDeps } from "./attest.js";
import { runDrift, driftHelp } from "./drift.js";
import { renderDoctrine } from "./doctrine.js";
import {
  graduateCommand,
  defaultLedgerPath,
  defaultMemoryDir,
  readLiveSnapshot,
  parkCommand,
  parseParkFile,
  type ParkItem,
} from "./graduate.js";
import { emitNodeEnvelope, type Envelope } from "./envelope.js";
import {
  libraryHealth,
  worstLevel,
  gateFailures,
  levelCounts,
  RETIRED_FIELDS,
} from "./health.js";
import { lookupNodeBuildConfig, parsePocketReadings } from "@storytree/orchestrator";
import type { PocketReading } from "@storytree/orchestrator";

import { nodeBuild, nodeHelp, nodeResolve, specView } from "@storytree/drive";
// The work-hierarchy ref index (ADR-0306 D1) — one scan per report, feeding health's tier-aware
// `story:`/`capability:` resolver.
import { loadWorkHierarchyIndex } from "@storytree/drive";
import { orchestrate } from "@storytree/drive";
import type { SdkQueryFn } from "@storytree/agent";
import { deriveIdentity, noticeboardCommand } from "@storytree/drive";
import { renderOfferFollowUps, OFFER_FOLLOW_NOTE } from "@storytree/context-traversal-capture";
import { captureBuildSpawn } from "@storytree/context-traversal-spawn";
import type { LeafSliceRun } from "@storytree/context-traversal-spawn";
// The graded claim-ledger verbs (ADR-0200 D2): claim / upgrade / downgrade / release / claims.
import { claimLedgerCommand, isClaimLedgerVerb } from "@storytree/drive";
import { claimHistoryCommand, isClaimHistoryVerb } from "@storytree/drive";
import type { ClaimLedgerReadLike, ClaimLedgerStoreLike } from "@storytree/drive";
// The claim namespace (ADR-0310 D2) — supplied by main.ts under --pg, never defaulted here.
import type { ClaimUniverseLoader } from "@storytree/drive";
import type { ClaimHistoryStoreLike } from "@storytree/drive";
import type { SessionClaimStoreLike, SessionIdentity } from "@storytree/drive";
import type { ClaimDocT } from "@storytree/notice-board";
import { findDependents } from "./retire.js";
import { typeMismatchRefusal } from "./set-value.js";
import { storyBuild, storyHelp } from "@storytree/drive";
import { flipFrontmatterStatus, type AdoptStory, type FlipResult } from "@storytree/drive";
import { treeCommand } from "./tree.js";
import type { VerdictReaderLike } from "./tree-verdicts.js";
import {
  uatCommand,
  uatHelp,
  type GitState,
  type UatDeps,
  type UatVerdictStoreLike,
} from "./uat.js";
import { gateCommand, gateHelp, type GateDeps, type GateOpts } from "./gate.js";
import { driveBuildTestsGate } from "./gate-build-driver.js";

// RETIRED_FIELDS (the retired-field denylist) moved to `@storytree/drive`'s health module with
// the checks it feeds — re-imported via the ./health.js shim above.

/**
 * The Library artifact whose doctrine every write surface surfaces (search-before-write). Rendered
 * on demand via {@link renderDoctrine} so the pointer's gloss is SOURCED from the artifact — edit
 * `edit-first-curation` and the CLI's nudge updates, with no hard-coded restatement to drift
 * (reference-don't-restate, ADR-0029 §7). The old hand-copied literal lived here.
 */
const EDIT_FIRST_ID = "edit-first-curation";

/**
 * The OWNER's timezone, named ONCE as a repo constant.
 *
 * Deliberately NOT read from the environment: `TZ` on a CI box or a remote container is not the
 * owner's timezone, and a wrong-but-plausible date is worse than a wrong-and-known one. Hard-coding
 * a single zone follows an existing repo convention rather than inventing one — the Cloud SQL sleep
 * window in `infra/cost-backstop.tf` is fixed to this same zone (ADR-0114). If the owner ever moves,
 * both places change together.
 */
const OWNER_TIMEZONE = "Australia/Sydney";

/**
 * Today's date in the OWNER's timezone, as `YYYY-MM-DD` — the clock behind the human-facing
 * `decided:` stamp on `adr new --decided`.
 *
 * Derived from UTC, any session running before ~10:00 Australia/Sydney recorded the decision as the
 * PREVIOUS day, in BOTH the `decided:` frontmatter and the `## Status` prose, and both had to be
 * hand-corrected on every owner-directed ADR. That is not cosmetic: the decision log is the
 * calibration surface every new session is sent to, and an off-by-one date silently mis-orders a
 * decision against the ADR it amends or supersedes.
 *
 * `en-CA` formats as `YYYY-MM-DD` directly, so no dependency is needed. NOT for `createdAt` /
 * `updatedAt` — those are machine ordering keys and correctly UTC.
 */
export function ownerLocalDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: OWNER_TIMEZONE }).format(now);
}

/** The shape `--decided-date` must take to override the derived owner-local date. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Library commands (ADR-0023). Read-only walking skeleton: `library` (dashboard), `artifact <id>`
 * (view), `artifact list <category>` (the interim search). Each returns an {@link Envelope} — the
 * result plus choose-your-own-adventure guidance. `run` parses argv and dispatches; it NEVER throws
 * on an expected miss (unknown id / bad category) — it returns an `ok: false` envelope with `next`.
 */

/** Preferred category order for the dashboard; unknown kinds sort after, alphabetically. */
const KIND_ORDER = [
  "definition",
  "principle",
  "pattern",
  "guardrail",
  "techstack",
  "process",
  "agent",
  "arc",
  "increment",
  "open-question",
  "friction",
  "template",
] as const;

/** Read a top-level string field off a stored doc body, or "" if absent. */
function fieldOf(stored: StoredDoc, key: "title" | "description"): string {
  const doc = stored.doc;
  if (typeof doc === "object" && doc !== null) {
    const v = (doc as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return "";
}

/**
 * An increment's `cites` off a stored doc (ADR-0306 D2), read defensively — a schema-level field, so
 * it never appears in the rendered body and a render that wants it must go to the stored doc.
 */
function citesOf(stored: StoredDoc): string[] {
  const doc = stored.doc;
  if (typeof doc !== "object" || doc === null) return [];
  const v = (doc as Record<string, unknown>)["cites"];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Read the `references` string[] off a stored doc body (the only edge field today). */
function refsOf(stored: StoredDoc): string[] {
  const doc = stored.doc;
  if (typeof doc === "object" && doc !== null) {
    const v = (doc as Record<string, unknown>).references;
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  }
  return [];
}

function groupByKind(docs: readonly StoredDoc[]): Map<string, StoredDoc[]> {
  const m = new Map<string, StoredDoc[]>();
  for (const d of docs) {
    const arr = m.get(d.kind);
    if (arr) arr.push(d);
    else m.set(d.kind, [d]);
  }
  return m;
}

/**
 * The listable categories: every kind the SCHEMA defines, unioned with any kind actually present in
 * the store.
 *
 * SCHEMA-derived, because the population is not the authority on what exists. Deriving the set from
 * rows present erased an empty tier twice over: a kind added to the schema stayed unlistable for
 * exactly as long as it took someone to write its first row — the window in which an agent orienting
 * on the new kind most needs to see it — and a lifecycle tier draining to zero, which for the retired
 * `proposal` kind was the SUCCESS state, read as `unknown category`. Both are false: an empty
 * mandatory-drain tier is a FINDING, and the instrument has to report it rather than deny it.
 *
 * The UNION keeps store-only kinds listable: `template` artifacts (ADR-0210) carry a kind the
 * knowledge union does not name and they list today, so the change is strictly widening — every
 * invocation that works keeps working and returns the same rows.
 */
function listableKinds(present: Iterable<string>): string[] {
  return orderedKinds([...Object.keys(KIND_SPECS), ...present]);
}

function orderedKinds(present: Iterable<string>): string[] {
  const set = new Set(present);
  const out: string[] = [];
  for (const k of KIND_ORDER) {
    if (set.has(k)) {
      out.push(k);
      set.delete(k);
    }
  }
  out.push(...[...set].sort());
  return out;
}

/** `<id>  <title>` rows, id column padded to the widest id. */
function idTitleRows(docs: readonly StoredDoc[]): string[] {
  const sorted = [...docs].sort((a, b) => a.id.localeCompare(b.id));
  const width = Math.max(1, ...sorted.map((d) => d.id.length));
  return sorted.map((d) => `  ${d.id.padEnd(width)}  ${fieldOf(d, "title")}`);
}

// `dashboard` (the bare `storytree library` view) moved to `@storytree/drive` (library-dashboard.ts,
// the ADR-0112 pattern) so the desktop orientation runner renders the SAME dashboard — re-exported
// here for back-compat; the dispatch below keeps calling it.
import { dashboard } from "@storytree/drive";
export { dashboard };

/**
 * The repo root — a PARAMETER (ADR-0246), not a derivation from this file's location.
 * `STORYTREE_REPO_ROOT` points the CLI at another project's checkout; unset, it falls back to the
 * module-location derivation (packages/cli/src -> four dirs up), which is storytree's own loop.
 */
function repoRoot(): string {
  return resolveRepoRoot({
    env: process.env[REPO_ROOT_ENV],
    derived: path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", ".."),
  }).root;
}

/**
 * `storytree library --check` (design §4 surface b) — the FULL per-id health report (all four checks).
 * Provides the fs-backed `docExists` resolver (under <repoRoot>/docs) so {@link libraryHealth} stays
 * pure. Envelope `ok` is false IFF a GATE-class check FAILs (non-zero exit, ADR-0026 §6); a WARN
 * keeps `ok` true (design §4 "A WARN keeps ok=true").
 *
 * THIS IS AN OPERATOR REPORT, NOT A MERGE GATE, and the output must never say otherwise. ADR-0026 §5
 * gave `libraryHealth` three consumers — the dashboard banner, this on-demand live read, and a test
 * in `pnpm -r test` — and only the last of the three runs on every merge. Its own Consequences say
 * which this is: "only an occasional operator `storytree library --check` does — by design, not
 * every push." No root `check:*` script and no CI job has ever run this command, so a red here
 * blocks nothing.
 *
 * It spoke in the gate's own voice anyway until 2026-08-08 — a broken-gate banner naming the failed
 * checks and instructing the reader to fix them before merging — and a session settling an unrelated
 * question read that as a live merge gate. That is the defect `RETIRED_CHECKS` exists to refuse
 * (`packages/cli/src/gate-order.ts`) arriving through prose rather than through an orphaned source
 * file, and `gate-order.test.ts`'s gate-voice sweep now refuses it mechanically — including, as it
 * happens, a docstring that reproduces the retired sentence verbatim, which is why this one
 * describes it instead. Re-wiring this as a rung is a separate decision needing production-catch
 * evidence and an ADR (ADR-0311 D5, `asset:justify-a-gate-rung`) — never merely the wiring.
 *
 * (The former count-reconciliation check read apps/studio/data/assets.json; it retired with that
 * generated file, ADR-0210.)
 */
export async function libraryCheck(store: Store): Promise<Envelope> {
  const docs = await store.queryDocs();
  const root = repoRoot();
  const docsDir = path.join(root, "docs");
  const storiesDir = path.join(root, "stories");
  const workUnits = loadWorkHierarchyIndex(storiesDir);
  const results = libraryHealth(docs, {
    currentSchemaVersion: CURRENT_SCHEMA_VERSION,
    retiredFields: RETIRED_FIELDS,
    docExists: (rel) => {
      const target = path.join(docsDir, rel);
      try {
        return existsSync(target) && statSync(target).isFile();
      } catch {
        return false;
      }
    },
    // The `node:<id>` resolver (ADR-0107 D2) — the sibling of docExists, so a citation of a story
    // that no longer exists surfaces as a WARN instead of being silently ignored.
    nodeExists: (nodeId) => findNodeSpecFile(storiesDir, nodeId) !== null,
    // The `story:` / `capability:` resolver (ADR-0306 D1) — tier-aware, because the schemes are, so
    // a `story:` ref naming a real capability reads as the wrong scheme rather than as absence. The
    // index is scanned ONCE for the whole report rather than per ref.
    workUnitTier: (unitId) => workUnits.get(unitId)?.tier ?? null,
  });
  const { fail, warn } = levelCounts(results);
  const gateFails = gateFailures(results);
  const lines: string[] = [];
  for (const r of results) {
    lines.push(`[${r.level}] ${r.name}`);
    for (const l of r.lines) lines.push(`        ${l}`);
  }
  lines.push("", `${fail} FAIL, ${warn} WARN  (worst: ${worstLevel(results)}).`);
  if (gateFails.length > 0) {
    lines.push(
      `GATE-CLASS FAIL: ${gateFails.map((r) => r.name).join(", ")} (exit 1).`,
      "  Severity, not authority: nothing runs this report on merge (ADR-0026 §5, \"by design, not",
      "  every push\"). `pnpm -r test` proves the same three checks over the frozen 13-artifact",
      "  fixture, which is NOT this corpus — so a red here is seen by nobody who does not run this.",
    );
  }
  return {
    ok: gateFails.length === 0,
    body: lines.join("\n"),
    next: [
      "storytree library",
      "storytree library artifact edit <id> --set <field>=<value> --pg   (drain a FAIL at its source)",
    ],
  };
}

/**
 * `storytree library artifact <id>` — print one artifact to stdout.
 *
 * `offerId` is the identity of the offer this render is about to record (ADR-0260 D3). When present,
 * every followable ref in the Sources block also gets a `next:` command CARRYING that id, so an agent
 * that takes one of those branches hands the offer's identity back on its own command line and the
 * answering read can declare the edge. Absent, the nav is exactly what it always was — and the
 * resulting reads record no edges, which is D4's accepted under-report rather than a defect.
 */
export async function viewArtifact(store: Store, id: string, offerId?: string): Promise<Envelope> {
  const stored = await store.getDoc(id);
  if (!stored) {
    return {
      ok: false,
      body: `no artifact "${id}" in the Library.`,
      next: ["storytree library", "storytree library artifact list <category>"],
    };
  }
  const a = renderStoredDoc(stored);
  const lines: string[] = [`# ${a.title}    [${a.category}]`, `id: ${a.id}`, ""];
  if (a.description) lines.push(a.description, "");
  lines.push(a.body);
  // "Sources": references grouped by target type, resolved against the corpus (asset:<id> -> kind).
  const byId = new Map((await store.queryDocs()).map((d) => [d.id, d] as const));
  const sources = groupSources(a.references, (refId) => {
    const t = byId.get(refId);
    return t ? { kind: t.kind, title: fieldOf(t, "title") } : null;
  });
  if (sources.length > 0) {
    lines.push("", "Sources:");
    for (const group of sources) {
      lines.push(`  ${group.group}:`);
      for (const item of group.items) lines.push(`    - ${item.label}  (${item.ref})`);
    }
  }
  // An increment's `cites` (ADR-0306 D2), rendered as its OWN block rather than folded into Sources.
  // This view is the narrow read `arc show` points every increment row at ("read/edit it: storytree
  // library artifact <id>"), so a citation edge invisible here would be unreachable from the one
  // command the arc offers for reading an entry. It is kept apart from Sources because the two are
  // different claims: `references` is what this artifact was WRITTEN FROM, `cites` is what the work
  // TOUCHES. Resolution is deliberately not attempted — that answer is checkout-dependent and
  // belongs to `arc show` (which holds the disk index) and to `library --check`.
  const citeRefs = citesOf(stored);
  if (citeRefs.length > 0) {
    lines.push("", "Cites (work hierarchy + guidance it stands on — ADR-0306 D2):");
    for (const ref of citeRefs) lines.push(`  - ${ref}`);
  }
  if (a.provenance) lines.push("", `provenance: ${a.provenance}`);
  // A `process` node DERIVES its `next:` from its branch-edges (ADR-0161: the node-keyed context DAG —
  // one shared `emitNodeEnvelope`, never a bespoke per-surface next). The hand-authored nav below is
  // the fallback for every other kind, and for a process with no graph authored yet (ADR-0161 dec 1:
  // migrate hand-authored `next[]` to derived opportunistically, per surface).
  let next: string[] = [
    `storytree library tree focus ${a.id}   (its local DAG)`,
    `storytree library artifact edit ${a.id}   (coming soon)`,
  ];
  if (stored.kind === "process") {
    const node = await renderProcessNode(store, a.id);
    if (node.ok && node.edges.length > 0) {
      const derived = emitNodeEnvelope({
        id: node.id,
        headline: node.headline,
        edges: node.edges.map((e) => ({
          ref: e.ref,
          ...(e.label !== undefined ? { label: e.label } : {}),
        })),
      });
      if (derived.next && derived.next.length > 0) next = [...derived.next];
    }
  }
  // The Sources block IS the offer (ADR-0260 D1), and D3 makes the offer's identity travel: one
  // pasteable follow-up per FOLLOWABLE ref, each naming the candidate set it came from. A `doc:` ref
  // gets none — it resolves to a file, not to a CLI read — which is the declared coverage caveat
  // rather than a hole to paper over with a command that could not run.
  //
  // ADR-0320: the form alone was measured insufficient (5048 offers, zero edges), so it now travels
  // with the ASK. The note is attached only when follow-ups were ACTUALLY produced — an artifact
  // whose refs are all `doc:` offers nothing followable, and a note pointing at commands that are
  // not there would be noise on the exact reads the caveats already call unobservable.
  if (offerId !== undefined) {
    const followUps = renderOfferFollowUps(offerId, a.references);
    if (followUps.length > 0) {
      return { ok: true, body: lines.join("\n"), next: [...next, ...followUps], note: OFFER_FOLLOW_NOTE };
    }
  }
  return { ok: true, body: lines.join("\n"), next };
}

/**
 * The BARE-BYTES envelope (`library artifact <id> --raw <field>`): `raw` carries one stored field's
 * exact value, and `main` writes it to stdout VERBATIM instead of formatting the envelope — no
 * heading, no `doctrine:`, no `next:`, no delta footer, and none of `formatEnvelope`'s trailing-
 * whitespace strip.
 *
 * This is the ONE deliberate exception to the guidance-envelope convention every other read follows
 * (ADR-0023 §4), and the exception IS the value: it makes the read composable with the existing
 * `--set <field>=@path` write, so correcting one bullet of a long prose field is a read→edit→write
 * round trip across two supported commands instead of a throwaway `PgLibraryStore` script. The cost
 * is that `--raw` cannot be composed with anything that expects an envelope — said out loud in
 * {@link artifactHelp} so the exception reads as a decision rather than an oversight.
 */
export interface RawEnvelope extends Envelope {
  readonly raw: string;
}

/** True when this envelope carries bare bytes `main` must WRITE rather than format. */
export function isRawEnvelope(e: Envelope): e is RawEnvelope {
  return typeof (e as { raw?: unknown }).raw === "string";
}

/**
 * `storytree library artifact <id> --raw <field>` — ONE stored field's exact value, and nothing else.
 *
 * A string field emits its bytes verbatim (the round trip the write side already supported in one
 * direction). Any other stored value emits its JSON — there is no byte-exact original to preserve.
 * An absent field is a MISS rather than empty output: it exits non-zero, names the field, and lists
 * the ones the doc actually has, because silence would be indistinguishable from an empty value.
 *
 * The flag is `--raw <field>`, deliberately NOT `--json`: on this verb `--json` is already an INPUT
 * option taking a whole doc, and overloading it would reproduce the exact confusion the missing read
 * path caused.
 */
/**
 * Every `<area> <sub>` that READS one artifact by id, and therefore honours `--raw <field>`.
 *
 * THIS LIST EXISTS BECAUSE THE FLAG USED TO BE DROPPED IN SILENCE. `--raw` is parsed once for the
 * whole CLI, but only the verb that thought to consult it ever did — so `arc show <id> --raw=intent`
 * returned the full rendered arc, and so did `--raw=endState`, and so did `--raw=nonsense`. Three
 * different questions, one byte-identical answer, and no signal that the flag had been ignored. That
 * is worse than a missing feature: the prescribed way to edit arc narrative is `arc edit --intent
 * @file`, so the obvious read-modify-write (`--raw=intent > f`, edit, write it back) would have
 * pasted the ENTIRE render — increment log, derived ADR list, trailing `next:` pointers — into the
 * `intent` field, and the output looked plausible enough that nothing said otherwise.
 *
 * So the fix is not only "route `arc show` too". A verb that does not read `--raw` REFUSES it
 * ({@link rawUnsupported}), which is what stops the next id-addressed read verb from re-acquiring the
 * bug by simply not thinking about the flag. Add the pair here when you add such a verb; the refusal
 * is what will tell you that you have to.
 */
const RAW_READ_VERBS: ReadonlyArray<readonly [area: string, sub: string]> = [
  ["library", "artifact"],
  ["arc", "show"],
];

/** Does `<area> <sub>` read one artifact by id? */
function rawIsRead(area: string, sub: string | undefined): boolean {
  return RAW_READ_VERBS.some(([a, s]) => a === area && s === sub);
}

/** `--raw` on a verb that does not read it — refused by name, never dropped. */
function rawUnsupported(area: string, sub: string | undefined): Envelope {
  const spelled = `${area}${sub === undefined ? "" : ` ${sub}`}`;
  return {
    ok: false,
    body: [
      `\`--raw <field>\` reads ONE stored field of ONE artifact, and \`${spelled}\` is not that read.`,
      "",
      "the verbs that honour it:",
      ...RAW_READ_VERBS.map(([a, s]) => `  storytree ${a} ${s} <id> --raw <field>`),
      "",
      "It is refused rather than ignored on purpose: a silently-dropped `--raw` returns the whole",
      "rendered view, which reads like a field value and will overwrite one if you write it back.",
    ].join("\n"),
    next: RAW_READ_VERBS.map(([a, s]) => `storytree ${a} ${s} <id> --raw <field>`),
  };
}

export async function rawField(store: Store, id: string, field: string): Promise<Envelope> {
  const stored = await store.getDoc(id);
  if (!stored) {
    return {
      ok: false,
      body: `no artifact "${id}" in the Library.`,
      next: ["storytree library artifact list <category>"],
    };
  }
  const doc = stored.doc;
  const fields = typeof doc === "object" && doc !== null ? (doc as Record<string, unknown>) : {};
  const value = fields[field];
  if (value === undefined) {
    return {
      ok: false,
      body: [
        `"${id}" has no stored field "${field}".`,
        "",
        `its fields: ${Object.keys(fields).sort().join(", ")}`,
      ].join("\n"),
      next: [`storytree library artifact ${id}   (the rendered view)`],
    };
  }
  const raw = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  // `body` carries the same text so a caller that DOES format the envelope still sees the value —
  // degraded (the render strips trailing whitespace), never wrong.
  const env: RawEnvelope = { ok: true, body: raw, raw };
  return env;
}

/**
 * `storytree library artifact list <category>` — the interim search (list by kind).
 *
 * The two answers are split: a category the schema does not define is a genuine user error
 * (`ok: false` + the available list), while a schema kind holding ZERO rows lists EMPTY at `ok: true`
 * in the same `<kind>  (0)` shape a populated tier uses — a fact about the population, never a fault
 * in the query. See {@link listableKinds} for why the set is schema-derived.
 */
export async function listCategory(store: Store, category: string | undefined): Promise<Envelope> {
  const kinds = listableKinds(groupByKind(await store.queryDocs()).keys());
  if (category === undefined || !kinds.includes(category)) {
    const which = category === undefined ? "no category given" : `unknown category "${category}"`;
    return {
      ok: false,
      body: `${which}. available categories: ${kinds.join(", ")}.`,
      next: kinds.map((k) => `storytree library artifact list ${k}`),
    };
  }
  const arr = await store.queryDocs({ kind: category });
  const body = [`${category}  (${arr.length})`, ...idTitleRows(arr)].join("\n");
  return {
    ok: true,
    body,
    doctrine: [await renderDoctrine(store, EDIT_FIRST_ID)],
    next: ["storytree library artifact <id>"],
  };
}

/** Guidance returned when a write is attempted against the offline (ephemeral) store. */
async function notWritable(store: Store): Promise<Envelope> {
  return {
    ok: false,
    body: "writes go to the shared store, not the offline copy — run with --pg (and bring the DB up first: pnpm db:up).",
    // The WHY is library doctrine, sourced not restated (ADR-0029 §7): the live store is the edit
    // surface; the body above is just the mechanical how-to.
    doctrine: [await renderDoctrine(store, "live-store-is-the-edit-surface")],
    next: [
      "pnpm db:up",
      "STORYTREE_DB_USER=<iam-email> storytree library artifact edit <id> --pg --set <field>=<value>",
    ],
  };
}

/** Pull `id` + `kind` off a validated doc (structured units carry `kind`; rendered assets carry `category`). */
function idKindOf(doc: Record<string, unknown>): { id: string; kind: string } {
  const id = typeof doc.id === "string" ? doc.id : "";
  const kind =
    typeof doc.kind === "string"
      ? doc.kind
      : typeof doc.category === "string"
        ? doc.category
        : "";
  return { id, kind };
}

/**
 * `storytree library artifact new --json '<doc>' | --file <path>` — create one artifact in the
 * shared store. Validates at the boundary (loud, but returned as guidance, not a throw) and REFUSES
 * to overwrite an existing id — pointing at `edit` instead (edit-first-curation as a guardrail).
 */
export async function newArtifact(
  deps: RunDeps,
  opts: { json: string | undefined; file: string | undefined },
): Promise<Envelope> {
  if (deps.writable !== true) return notWritable(deps.store);

  let raw = opts.json;
  if (raw === undefined && opts.file !== undefined) {
    try {
      raw = await readFile(opts.file, "utf8");
    } catch (e) {
      return {
        ok: false,
        body: `could not read --file ${opts.file}: ${(e as Error).message}`,
        next: ["storytree library artifact list <category>"],
      };
    }
  }
  if (raw === undefined) {
    return {
      ok: false,
      body: "new needs the artifact as JSON: --json '<doc>' or --file <path>.",
      doctrine: [await renderDoctrine(deps.store, EDIT_FIRST_ID)],
      next: ["storytree library artifact list <category>   (search before you write)"],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, body: `invalid JSON: ${(e as Error).message}`, next: [] };
  }
  let valid: unknown;
  try {
    // Migrate-on-write (design §3): forward an old-shape doc through pending migrations, then
    // validate — so a doc still carrying a retired field (e.g. seeAlso) is upcast, not rejected.
    valid = upcastAndValidate(parsed);
  } catch (e) {
    // Read the refusal back against the ONE arm the doc means, never the whole LibraryDoc union
    // dump (which blames the other arm for every field this one requires).
    return { ok: false, body: `doc failed validation:\n${explainDocValidationError(parsed, e)}`, next: [] };
  }

  const { id, kind } = idKindOf(valid as Record<string, unknown>);
  if (!id) return { ok: false, body: "doc has no id.", next: [] };
  if (await deps.store.getDoc(id)) {
    return {
      ok: false,
      body: `"${id}" already exists — edit it, don't recreate it.`,
      doctrine: [await renderDoctrine(deps.store, EDIT_FIRST_ID)],
      next: [`storytree library artifact edit ${id} --set <field>=<value>`],
    };
  }
  const saved = await deps.store.upsertDoc({ id, kind, doc: valid, actor: deps.actor ?? defaultCliActor() });
  return {
    ok: true,
    body: `created ${saved.id}  [${saved.kind}].`,
    next: [`storytree library artifact ${saved.id}`, `storytree library tree focus ${saved.id}`],
  };
}

/**
 * Resolve the `--set field=@path` INNER value — the one `@path` shape the flag boundary cannot see,
 * because its `@` sits after the `=` and the flag's own value is `field=@path`. Every other prose
 * flag is expanded once, up front, by {@link expandAtPathFlags} (see `at-path.ts`); this is not a
 * general-purpose helper to reach for from a new write verb, and a new one should not need it.
 *
 * A plain value passes through unchanged. Throws (ENOENT etc.) when the file can't be read — the
 * `--set` parser converts that into an envelope.
 */
export async function resolveAtPathValue(value: string): Promise<string> {
  return value.startsWith("@") ? readFile(value.slice(1), "utf8") : value;
}

/** Machine-managed doc fields hidden from the `artifact edit` "editable fields" hint (still validated). */
const UNSETTABLE_FIELDS: ReadonlySet<string> = new Set(["kind", "schemaVersion", "createdAt", "updatedAt"]);

/**
 * `storytree library artifact edit <id> --set <field>=<value> ...` (or `--json`/`--file` to replace
 * wholesale) — patch one artifact in the shared store. Loads it, applies the change, re-validates
 * (a bad edit returns the validation message as guidance, never persists), then upserts (one event +
 * projection update). The id must already exist — `new` creates.
 *
 * Three ergonomics beyond a bare `field=value` (the arc-edit friction, ADR-0168): `field=@path`
 * reads the value from a FILE (long/multi-line prose without shell mangling); a typo'd field name
 * on a structured kind is rejected with a CLEAR message (via {@link knownFieldsForKind}) instead of
 * the opaque `.strict()` union dump; and an ARRAY-typed field (`references`, a uat-criterion's
 * `stepRefs`, …) takes a JSON array — inline or @file — via {@link arrayFieldsForKind} (a bare
 * string could never validate, so the field was previously unwritable from this surface). One array
 * stays fenced BY POLICY: an arc's `increments` log is append-only — that is what `storytree arc
 * increment add` is for (ADR-0183 D1); see the guard in the `--set` loop below.
 *
 * One field is refused BY POLICY rather than by shape: an arc's `lifecycle` (ADR-0239 D2). It is a
 * valid field the schema would accept, but each transition must be written from the prose that
 * justifies it, so it belongs to `storytree arc close` and `storytree arc reopen` (ADR-0337) — the
 * two verbs that write that prose — and to no generic edit. See the guard in the `--set` loop below.
 */
export async function editArtifact(
  deps: RunDeps,
  id: string | undefined,
  opts: { sets: readonly string[]; json: string | undefined; file: string | undefined },
): Promise<Envelope> {
  if (deps.writable !== true) return notWritable(deps.store);
  if (id === undefined) {
    return {
      ok: false,
      body: "edit needs an id: storytree library artifact edit <id> --set <field>=<value>",
      next: ["storytree library artifact list <category>"],
    };
  }
  const existing = await deps.store.getDoc(id);
  if (!existing) {
    return {
      ok: false,
      body: `no artifact "${id}" to edit.`,
      next: ["storytree library artifact list <category>", "storytree library artifact new --json '<doc>'"],
    };
  }

  let nextDoc: unknown;
  let summary: string;
  // Non-null ONLY on the `--set` path: the fields this edit actually names, for the field-scoped
  // write below (ADR-0352). `--json`/`--file` leaves it null and takes the whole-doc replace.
  let patch: Record<string, unknown> | null = null;
  const patchFields: Record<string, unknown> = {};
  if (opts.json !== undefined || opts.file !== undefined) {
    let raw = opts.json;
    if (raw === undefined && opts.file !== undefined) {
      try {
        raw = await readFile(opts.file, "utf8");
      } catch (e) {
        return { ok: false, body: `could not read --file ${opts.file}: ${(e as Error).message}`, next: [] };
      }
    }
    try {
      nextDoc = JSON.parse(raw as string);
    } catch (e) {
      return { ok: false, body: `invalid JSON: ${(e as Error).message}`, next: [] };
    }
    summary = "replaced whole doc";
  } else {
    if (opts.sets.length === 0) {
      return {
        ok: false,
        body: "nothing to change — pass --set <field>=<value> (repeatable), or --json/--file to replace.",
        next: [`storytree library artifact ${id}`],
      };
    }
    const base: Record<string, unknown> =
      typeof existing.doc === "object" && existing.doc !== null
        ? { ...(existing.doc as Record<string, unknown>) }
        : {};
    // A typed ref-list field (KIND_SPECS refList, e.g. the agent kind's context/rules) is a
    // string[] on the doc — coerce the --set string by splitting on whitespace/commas so
    // `--set context=asset:a,asset:b` works without --json.
    const kindStr = typeof base["kind"] === "string" ? (base["kind"] as string) : undefined;
    const kindSpecs =
      kindStr !== undefined && Object.hasOwn(KIND_SPECS, kindStr)
        ? KIND_SPECS[kindStr as keyof typeof KIND_SPECS]
        : [];
    const refListFields = new Set(kindSpecs.filter((s) => s.refList === true).map((s) => s.field));
    // The known field set for a structured kind (null for a rendered LibraryAsset, which carries
    // `category` not `kind`) — used to reject a typo'd field name up front with a clear message,
    // rather than letting the .strict() schema throw an opaque "Unrecognized key(s)" union dump.
    const knownFields = kindStr !== undefined ? knownFieldsForKind(kindStr) : null;
    // The ARRAY-typed fields (`references`, a uat-criterion's `stepRefs`, …): a bare string can
    // never validate against them, so `--set` parses the value (inline or @file) as a JSON array.
    const arrayFields = kindStr !== undefined ? arrayFieldsForKind(kindStr) : null;
    // The mirror image, and the reason it is needed: a `--set` value is ALWAYS a string, so a JSON
    // array sent to a PROSE field validates perfectly and persists as literal JSON text at exit 0
    // (`artifact-edit-set-refuses-a-type-mismatched-value`). The array path above is exactly what
    // licenses the mistake, so the two sets are read together, here, from the same schema.
    const stringFields = kindStr !== undefined ? stringFieldsForKind(kindStr) : null;
    const changed: string[] = [];
    for (const s of opts.sets) {
      const i = s.indexOf("=");
      if (i < 0) return { ok: false, body: `bad --set "${s}" — use field=value (or field=@path to read the value from a file).`, next: [] };
      const field = s.slice(0, i);
      if (knownFields !== null && !knownFields.has(field)) {
        const editable = [...knownFields].filter((f) => !UNSETTABLE_FIELDS.has(f)).sort();
        return {
          ok: false,
          body: [
            `unknown field "${field}" for a ${kindStr} artifact — the strict schema would reject it, so this edit is refused (not silently dropped).`,
            `editable fields: ${editable.join(", ")}.`,
            ...(kindStr === "arc"
              ? ["for an arc's narrative or its increment log, use the first-class verbs: storytree arc edit / storytree arc increment add."]
              : []),
          ].join("\n"),
          next: [`storytree library artifact ${id}`],
        };
      }
      // ADR-0239 D2 — an arc's `lifecycle` is NOT a free flip. The schema would happily take it (it
      // is a real field, so the unknown-field guard above lets it through), but the state is a
      // projection of prose that supports it: each direction has a verb that records the prose AND
      // sets the flag. A bare `--set` here would record the state with no evidence behind it — the
      // exact move ADR-0084/0086 forbid for an ADR status, refused for the same reason.
      //
      // BOTH directions are now reachable (ADR-0337). This refusal used to name only `arc close` and
      // then say re-opening was OWNER-only — which was a dead end, since no owner path existed
      // either, and a reader who needed `active` was left with a rule and no verb. It names both.
      if (kindStr === "arc" && field === "lifecycle") {
        return {
          ok: false,
          body: [
            "an arc's lifecycle is not a free flip — each direction is written FROM EVIDENCE, in one verb:",
            `  storytree arc close  ${id} --outcome "<the end-state condition this landing met>" --pg`,
            `  storytree arc reopen ${id} --reason  "<why that end state does not hold after all>" --pg`,
            "each records its increment and sets the flag together (ADR-0239 D2 / ADR-0337 — increment",
            "first since ADR-0305 D1 made it its own row, so an interrupted write never leaves a flipped",
            "arc with no prose behind it).",
          ].join("\n"),
          next: [
            `storytree arc show ${id} --pg`,
            `storytree arc close ${id} --outcome "…" --pg`,
            `storytree arc reopen ${id} --reason "…" --pg`,
          ],
        };
      }
      // The `increments` policy guard stood here — an explicit refusal of a wholesale `--set` over
      // the arc's append-only landing log. ADR-0305 D1 removed the field from the arc schema
      // entirely, so the UNKNOWN-FIELD refusal above now fires first and does the same job more
      // strongly: it names the field, lists what IS editable, and points at `arc increment add`. A
      // second guard for a field the schema no longer declares would be unreachable code that reads
      // like a live rule.
      // `field=@path` reads the value from a file (long/multi-line prose, no shell mangling).
      let value: string;
      try {
        value = await resolveAtPathValue(s.slice(i + 1));
      } catch (e) {
        return { ok: false, body: `could not read --set ${field}=${s.slice(i + 1)}: ${(e as Error).message}`, next: [] };
      }
      // The value boundary (`set-value.ts`): a structured JSON payload headed at a string-declared
      // field is refused HERE — after `@path` resolution, since the file's contents are what would
      // be stored, and before anything is written. The strict schema cannot catch this one: a JSON
      // array IS a valid string, so it validates and persists, and only the render shows it.
      const mismatch = typeMismatchRefusal({
        kind: kindStr ?? "artifact",
        field,
        value,
        stringFields,
      });
      if (mismatch !== null) {
        return {
          ok: false,
          body: mismatch,
          next: [`storytree library artifact ${id} --raw ${field} --pg`, `storytree library artifact ${id}`],
        };
      }
      // The arc containment edge — `arcRef`, on a plan (ADR-0183 D3) or on an open question
      // (ADR-0267 D4). It is the edge a DERIVED arc view is assembled from, so a DANGLING one is
      // worse than an absent one: the arc surface silently omits the child while the child claims a
      // parent, and a surface the owner cannot trust is the thing ADR-0267 exists to build. Hence
      // two affordances here, both aimed at that. (1) A BARE arc id is accepted and normalised to
      // the `asset:` pointer the schema's regex demands — the prefix is a wire detail, and a bare id
      // would otherwise fail with an opaque regex dump. (2) The target must EXIST and be an arc, so
      // a typo is refused at the write instead of persisting an edge that renders nowhere. An empty
      // value REMOVES the stamp (the field is optional), which is the remedy for a mis-stamp without
      // resorting to a whole-doc `--json` replace.
      if (field === "arcRef") {
        const wanted = value.trim();
        if (wanted === "") {
          delete base[field];
          // The one branch that skips the patch-record at the foot of this loop, so it records its
          // own: `undefined` is how a field-scoped write says DELETE THIS KEY (ADR-0352,
          // `mergeFields`). Without this the clear would land as a no-op patch.
          patchFields[field] = undefined;
          changed.push(`${field} (cleared)`);
          continue;
        }
        const arcId = wanted.startsWith("asset:") ? wanted.slice("asset:".length) : wanted;
        const target = await deps.store.getDoc(arcId);
        if (!target || target.kind !== "arc") {
          return {
            ok: false,
            body: [
              target
                ? `"${arcId}" is a ${target.kind}, not an arc — arcRef must point at an arc.`
                : `no arc "${arcId}" — refusing to stamp a containment edge at an arc that does not exist.`,
              "A dangling arcRef renders nowhere: the arc's derived view would omit this child while the child claims a parent.",
              "Arcs are live-canonical — if this is an offline run, re-run with --pg.",
            ].join("\n"),
            next: ["storytree arc list --pg", `storytree library artifact ${id}`],
          };
        }
        value = `asset:${arcId}`;
      }
      if (refListFields.has(field)) {
        base[field] = value.split(/[\s,]+/).filter((v) => v !== "");
      } else if (arrayFields !== null && arrayFields.has(field)) {
        // An array-typed schema field: the value — inline or @file — must be a JSON array. A bare
        // string can never validate, so refuse with the expected format named instead of letting
        // the strict schema throw "Expected array, received string" with no way forward.
        let parsed: unknown;
        try {
          parsed = JSON.parse(value);
        } catch (e) {
          return {
            ok: false,
            body: [
              `"${field}" on a ${kindStr} is an array field — pass a JSON array,`,
              `inline (--set ${field}='["…","…"]') or from a file (--set ${field}=@values.json).`,
              `could not parse the value as JSON: ${(e as Error).message}`,
            ].join("\n"),
            next: [`storytree library artifact ${id}`],
          };
        }
        if (!Array.isArray(parsed)) {
          return {
            ok: false,
            body: [
              `"${field}" on a ${kindStr} is an array field and the value parsed as JSON but not as an ARRAY —`,
              `pass a JSON array, inline (--set ${field}='["…","…"]') or from a file (--set ${field}=@values.json).`,
            ].join("\n"),
            next: [`storytree library artifact ${id}`],
          };
        }
        base[field] = parsed;
      } else {
        base[field] = value;
      }
      changed.push(field);
      patchFields[field] = base[field];
    }
    nextDoc = base;
    patch = patchFields;
    summary = `set ${changed.join(", ")}`;
  }

  // A `--set` edit is FIELD-SCOPED (ADR-0352): write only the fields named, merged against current
  // state inside the store's own write. The whole-doc path below reverts anything a sibling session
  // landed between our read at the top of this function and the write here — measured, not
  // theoretical: it silently reverted 7,058 characters of `session-orchestrator`'s workflow while
  // both writers reported success. `--json`/`--file` keeps the whole-doc path on purpose, because a
  // wholesale replace genuinely IS a replace.
  if (patch !== null) {
    let saved: Awaited<ReturnType<typeof deps.store.patchDoc>>;
    try {
      saved = await deps.store.patchDoc({
        id,
        fields: patch,
        actor: deps.actor ?? defaultCliActor(),
        // Migrate-on-write (design §3) still runs, but now on the MERGED doc, inside the write —
        // validating our stale copy out here would prove nothing about what actually lands.
        validate: (merged) => upcastAndValidate(merged),
      });
    } catch (e) {
      return {
        ok: false,
        body: `edit would make "${id}" invalid:\n${explainDocValidationError(nextDoc, e)}`,
        next: [`storytree library artifact ${id}`],
      };
    }
    if (!saved) {
      // getDoc saw it at the top of this function; a null here means a concurrent retire won.
      return { ok: false, body: `"${id}" was retired while this edit was being prepared.`, next: ["storytree library"] };
    }
    return {
      ok: true,
      body: `updated ${saved.id} (${summary}).`,
      next: [`storytree library artifact ${saved.id}`, `storytree library tree focus ${saved.id}`],
    };
  }

  let valid: unknown;
  try {
    // Migrate-on-write (design §3): upcast the edited doc through pending migrations before
    // validating, so an edit to a lagging-version row is forward-migrated, not rejected.
    valid = upcastAndValidate(nextDoc);
  } catch (e) {
    return {
      ok: false,
      body: `edit would make "${id}" invalid:\n${explainDocValidationError(nextDoc, e)}`,
      next: [`storytree library artifact ${id}`],
    };
  }
  const { id: vid, kind } = idKindOf(valid as Record<string, unknown>);
  const saved = await deps.store.upsertDoc({ id: vid || id, kind, doc: valid, actor: deps.actor ?? defaultCliActor() });
  return {
    ok: true,
    body: `updated ${saved.id} (${summary}).`,
    next: [`storytree library artifact ${saved.id}`, `storytree library tree focus ${saved.id}`],
  };
}

/** A `--superseded-by` ref must point at a replacement artifact (`asset:<id>`) or a source (`doc:<path>`). */
const SUPERSEDED_BY_REF = /^(asset:[A-Za-z0-9_-]+|doc:.+)$/;

/**
 * `storytree library artifact retire <id> --reason "..." [--superseded-by <ref>] --pg` — RETIRE one
 * artifact of ANY kind from the live store (owner call, 2026-06-20). The retire is a delete WITH a
 * recorded rationale: `deleteDoc` folds `retiredReason` / `supersededBy` onto the append-only
 * `deleted` event, so WHY the artifact left the projection is durable even though the row is gone
 * (ADR-0017: history = events). The session actor is stamped (not the curator) — this is a
 * human-driven close, distinct from the librarian-curator's in-build OQ auto-retire (curate.ts).
 *
 * The ONE gate (replacing the curator's open-question kind-fence): reference integrity. If any other
 * live artifact still references this one via an `asset:<id>` edge, the retire is HARD-REFUSED and
 * the dependents are listed — re-point or retire them first. An artifact with no inbound edges
 * retires cleanly. `--reason` is mandatory (the rationale is the whole point); `--pg` is required
 * (a retire against the ephemeral offline store would be a no-op).
 */
export async function retireArtifact(
  deps: RunDeps,
  id: string | undefined,
  opts: { reason: string | undefined; supersededBy: string | undefined },
): Promise<Envelope> {
  if (deps.writable !== true) return notWritable(deps.store);
  if (id === undefined) {
    return {
      ok: false,
      body: "retire needs an id: storytree library artifact retire <id> --reason \"...\"",
      next: ["storytree library artifact list <category>"],
    };
  }
  const reason = opts.reason?.trim();
  if (reason === undefined || reason === "") {
    return {
      ok: false,
      body: "retire needs --reason \"<why>\" — the rationale is recorded on the delete event (retire-with-rationale).",
      next: [`storytree library artifact ${id}`],
    };
  }
  if (opts.supersededBy !== undefined && !SUPERSEDED_BY_REF.test(opts.supersededBy)) {
    return {
      ok: false,
      body: `bad --superseded-by "${opts.supersededBy}" — use asset:<id> (a replacement artifact) or doc:<path> (e.g. doc:decisions/0059-x.md).`,
      next: [`storytree library artifact ${id}`],
    };
  }

  const existing = await deps.store.getDoc(id);
  if (!existing) {
    return {
      ok: false,
      body: `no artifact "${id}" to retire.`,
      next: ["storytree library artifact list <category>"],
    };
  }

  // The reference-integrity gate (the only gate): refuse while anything still depends on it.
  const dependents = findDependents(id, await deps.store.queryDocs());
  if (dependents.length > 0) {
    const rows = dependents.map((d) => `  ← ${d.id}  ${fieldOf(d, "title")}  [${d.kind}]`);
    return {
      ok: false,
      body: [
        `cannot retire "${id}" — ${dependents.length} artifact${dependents.length === 1 ? "" : "s"} still reference${dependents.length === 1 ? "s" : ""} it (asset:${id}):`,
        ...rows,
        "",
        "re-point or retire the dependents first, then retire this one.",
      ].join("\n"),
      next: [`storytree library tree focus ${id}`, ...dependents.map((d) => `storytree library artifact ${d.id}`)],
    };
  }

  const dropped = await deps.store.deleteDoc(id, {
    actor: deps.actor ?? defaultCliActor(),
    reason,
    ...(opts.supersededBy !== undefined ? { supersededBy: opts.supersededBy } : {}),
  });
  if (!dropped) {
    // getDoc saw it a moment ago; a false here means a concurrent retire won the race.
    return { ok: false, body: `"${id}" was already retired (no row to drop).`, next: ["storytree library"] };
  }
  return {
    ok: true,
    body: [
      `retired ${id}  [${existing.kind}] — ${fieldOf(existing, "title")}`,
      `reason: ${reason}`,
      ...(opts.supersededBy !== undefined ? [`superseded by: ${opts.supersededBy}`] : []),
    ].join("\n"),
    next: ["storytree library", "storytree library artifact list <category>"],
  };
}

/*
 * The three seed<->live ceremonies are GONE (ADR-0302 D4, ADR-0307 D3): `library sync-agents`,
 * `library sync-corpus` and `library export-corpus` existed only to keep a committed mirror in
 * step with the live store. The live store is the only source of truth (ADR-0302 D1), so there is
 * nothing left to reconcile in either direction, and the two-surface edit dance they forced is over:
 * edit the artifact with `library artifact edit <id> --pg` and regenerate the projections.
 */

/**
 * `storytree library tree focus <id>` — the DAG **for one node only** (ADR-0023): its outbound
 * references (intra-library `asset:` edges + `doc:` source/ADR pointers, the latter surfaced on
 * demand) and the inbound `asset:` edges that point at it (a derived back-edge scan). Honest about
 * sparsity: intra-library edges are few today, so the view doubles as a friction signal for the
 * typed `derives_from` / `consumes` edges a later slice will add.
 */
export async function treeFocus(store: Store, id: string | undefined): Promise<Envelope> {
  if (id === undefined) {
    return {
      ok: false,
      body: "tree focus needs an id: storytree library tree focus <id>",
      next: ["storytree library"],
    };
  }
  const stored = await store.getDoc(id);
  if (!stored) {
    return {
      ok: false,
      body: `no artifact "${id}" to focus.`,
      next: ["storytree library", "storytree library artifact list <category>"],
    };
  }
  const all = await store.queryDocs();
  const byId = new Map(all.map((d) => [d.id, d] as const));

  const outbound: string[] = [];
  let firstLibraryNeighbour: string | undefined;
  for (const r of refsOf(stored)) {
    if (r.startsWith("asset:")) {
      const tid = r.slice("asset:".length);
      const t = byId.get(tid);
      firstLibraryNeighbour ??= tid;
      outbound.push(`  → ${tid}${t ? `  ${fieldOf(t, "title")}  [${t.kind}]` : "  (missing target)"}   (library)`);
    } else if (r.startsWith(NODE_REF_PREFIX)) {
      // ADR-0107 D2's proving-process anchor: an edge OUT of the library at a story / capability.
      // Not a "source" — reading it means `storytree tree <id>`, not opening a doc.
      outbound.push(`  → ${r.slice(NODE_REF_PREFIX.length)}   (story node — storytree tree ${r.slice(NODE_REF_PREFIX.length)})`);
    } else {
      outbound.push(`  → ${r}   (source — surfaced on demand)`);
    }
  }

  const needle = `asset:${id}`;
  const inbound = all
    .filter((d) => d.id !== id && refsOf(d).includes(needle))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((d) => `  ← ${d.id}  ${fieldOf(d, "title")}  [${d.kind}]`);

  const hasLibraryEdge = outbound.some((l) => l.includes("(library)")) || inbound.length > 0;
  const lines: string[] = [
    `# ${fieldOf(stored, "title")}    [${stored.kind}]   — tree focus`,
    `id: ${id}`,
    "",
    "outbound  (what this references / derives from):",
    ...(outbound.length > 0 ? outbound : ["  (none)"]),
    "",
    "inbound  (what references this):",
    ...(inbound.length > 0 ? inbound : ["  (none yet)"]),
  ];
  if (!hasLibraryEdge) {
    lines.push(
      "",
      "note: no intra-library edges here yet — typed derives_from / consumes land in a later slice.",
    );
  }

  const next = [`storytree library artifact ${id}`];
  if (firstLibraryNeighbour !== undefined) {
    next.push(`storytree library tree focus ${firstLibraryNeighbour}`);
  }
  return { ok: true, body: lines.join("\n"), next };
}

function treeHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree library tree — navigate the DAG, one node at a time.",
      "",
      "  storytree library tree focus <id>   the local DAG of one artifact (in/out edges)",
    ].join("\n"),
    next: ["storytree library"],
  };
}

function graduateHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree library graduate — the agent-memory → Library graduation worklist (ADR-0095 / ADR-0202).",
      "",
      "Reads the harness agent-memory store, classifies each durable memory to its Library kind,",
      "resolves its [[wiki-links]] against the seed corpus, and flags duplicates. The worklist is",
      "park-lease-filtered (ADR-0202): only new / changed / lease-expired candidates show LIVE; a",
      "reviewed wont-graduate verdict PARKS a memory until it changes or its lease expires.",
      "",
      "  storytree library graduate                    the summary worklist (read-only)",
      "  storytree library graduate --review           full per-candidate detail (incl. the body)",
      "  storytree library graduate --memory-dir <p>   read memory from <p> (default: the harness store)",
      '  storytree library graduate park <name> --reason "<why>" [--lease-days <n>]',
      "                                                record a park verdict (default lease 60 days)",
      "  storytree library graduate park --file <parks.json>",
      "                                                batch: [{ name, reason, leaseDays? }]",
    ].join("\n"),
    next: ["storytree library graduate --review", "storytree library"],
  };
}

async function topHelp(store: Store): Promise<Envelope> {
  return {
    ok: true,
    body: [
      "storytree — the agent's interface to the project (ADR-0023).",
      "",
      "proof workflows (ADR-0118 — surface the GOAL; the grain primitives nest under each, reached by",
      "drilling into `<workflow> --help`):",
      "  adopt <story>    bring a brownfield story into the fold — observe-and-sign → mapped→proposed  (· plan · gate)",
      "  build <id>       drive red→green — auto-routes node vs story by tier  (· build node | story | gate --real)",
      "  witness <story>  the operator proof of a story's UAT — list · attest (a verdict) · vouch (a vouch, ADR-0044)",
      "  tree [<story>]   orient: the work hierarchy + build surface + reliability-gate & UAT glyphs",
      "",
      "the rest:",
      "  library          explore + curate the Library (the knowledge tier)",
      "  friction         file what fought you → the Library (ADR-0168) — new | migrate | reinforce | route | list",
      "  factory health   is the factory getting better? recurrence-since-route · distinct bottlenecks · coupling churn (ADR-0316, report-only)",
      "  noticeboard      the claim ledger (ADR-0200/0033) — view | declare | done | claim | upgrade | downgrade | release | claims",
      "  branch next      a branch dies on merge (ADR-0142) — succeed a dead branch: fresh cut + re-declare",
      "  worktree         create (the claim-gated workspace ceremony, ADR-0200 D3) | prune (reap dead worktrees, ADR-0142/0033)",
      "  coverage         does every declared contract have an observed test? the coverage-honesty check (ADR-0020)",
      "  drift            is a proof's bound code still fresh? the binding-staleness flag (ADR-0016)",
      "  adr              search the decision log (adr list) + allocate numbers (ADR-0050/0086)",
      "  arc              the initiative overlay (ADR-0183) — an arc reveals its increments/stories/ADRs by query",
      "  increment        the ephemeral choreography tier (ADR-0183) — increment check <id>: the freshness gate",
      "  agents <name>    assemble an agent's system prompt from the Library (ADR-0051)",
      "  orchestrate      run the session-orchestrator agent headlessly: orient + propose (ADR-0108)",
      "  desktop          launch the Electron desktop client + install its Windows shortcut (ADR-0109/0111)",
      "",
      "the proof primitives relocated UNDER the workflows above (ADR-0118); the old grain verbs keep",
      "working as back-compat aliases (nothing breaks, they just moved):",
      "  node build → build node · story build → build story · node resolve → build node resolve",
      "  gate run → adopt gate · gate run --real → build gate --real · gate list → tree",
      "  uat list|attest → witness list|attest · attest → witness vouch",
      "",
      "start here:",
      "  storytree library    health + a map of every artifact + the commands",
    ].join("\n"),
    // The "how to use this CLI" doctrine is library-sourced, not restated here (ADR-0029 §7): pull
    // context just-in-time, drill in to earn the detail (the choose-your-own-adventure stance, ADR-0023).
    doctrine: [await renderDoctrine(store, "pull-based-context-architecture")],
    next: ["storytree library"],
  };
}

function treeViewHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree tree — the work-hierarchy orientation surface (ADR-0033).",
      "",
      "  storytree tree [--pg]              every story, one line each",
      "  storytree tree <story-id> [--pg]   one story: capabilities, build surface, edges",
      "  storytree tree spec <node-id>      the full spec markdown for one story or capability",
      "",
      "with --pg the views weave in one signed-verdict glyph per node (✓ proven / ✗ last run",
      "failed / – never built, read from events.verdict); offline both views render without",
      "them — never an error. Live sessions render on the claim-ledger board (ADR-0200):",
      "storytree noticeboard --pg.",
    ].join("\n"),
    next: ["storytree tree", "pnpm db:up"],
  };
}

function noticeboardHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree noticeboard — the claim ledger (ADR-0200; presence is retired — the ledger is the",
      "one coordination + observability surface). identity is derived from the enclosing",
      "git-registered linked worktree, whatever its parent path (for example",
      "`.claude/worktrees/<name>` or `.codex/worktrees/<n>/storytree`) — never typed. The primary",
      "checkout is deliberately excluded because it has no isolated session identity.",
      "",
      "  storytree noticeboard --pg                                        the board (live claims, by session)",
      "  storytree noticeboard declare --working-on <prose> --node <id>... --pg   take the work claim on each node",
      "  storytree noticeboard done --pg                                   release every claim this session holds",
      "",
      "the graded claim ledger (ADR-0200): exploring is shared and carries your intent prose; work",
      "is the exclusive slot; waiting is the queue behind it (release promotes the oldest live waiter).",
      '  storytree noticeboard claim <unit-id> [--grade exploring|waiting|work] [--intent "<prose>"] --pg',
      "  storytree noticeboard upgrade <unit-id> --pg                      exploring→work (queues when held)",
      "  storytree noticeboard downgrade <unit-id> --grade exploring|waiting --pg",
      "  storytree noticeboard release <unit-id> --pg                      drop this session's claim (any grade)",
      "  storytree noticeboard claims <unit-id> --pg                       the unit's rows, queue order",
      "  storytree noticeboard mine --pg                                   what THIS session holds — no unit id needed",
      "",
      "every claim read marks a STALE row as stale (no heartbeat for 2h — reclaimable by anyone,",
      "and blocking nobody). `mine` shows your own stale rows too: they still sit in the ledger.",
      "",
      "the AUDIT LOG (ADR-0310 D1) — every verb above reads STATE; `history` reads TRANSITIONS.",
      "a refusal leaves no state behind, so only this can tell 'refused and about to queue' from",
      "'never claimed'. read-only; default window 30 days.",
      "  storytree noticeboard history --pg                                the window's summary: totals, types, hot spots",
      "  storytree noticeboard history <unit-id> --pg                      that unit's transitions + hold spans",
      "  storytree noticeboard history --refusals --pg                     every refusal + who blocked it",
      "  storytree noticeboard history --holdings --pg                     who held what, and for how long",
      "    scope/window: --session <id> · --type <transition> · --days <n|all> · --limit <n|all>",
      "",
      "writes need the live DB: pnpm db:up first. The board read degrades politely without it.",
    ].join("\n"),
    next: [
      "pnpm db:up",
      "storytree noticeboard --pg",
      "storytree noticeboard mine --pg",
      "storytree noticeboard history --pg",
    ],
  };
}

function orchestrateHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree orchestrate <intent> — run the session-orchestrator agent HEADLESSLY (ADR-0108 Phase 1).",
      "",
      "Loads the SAME generated `session-orchestrator` agent the terminal session embodies (ADR-0051),",
      "wires the READ-ONLY orientation tools (tree / library / noticeboard), and drives one live SDK",
      "session that ORIENTS on the real three surfaces and PROPOSES a unit. Read/propose ONLY — it holds",
      "no signing key and writes, builds, signs, and lands NOTHING (Phases 3–5 of ADR-0108). One",
      "orchestration at a time.",
      "",
      '  storytree orchestrate "orient and propose the next unit"',
      "  storytree orchestrate <intent> --max-turns <n> --budget <usd> --model <id>",
      "",
      "Live + subscription-billed (needs CLAUDE_CODE_OAUTH_TOKEN). --max-turns gives the agent room to",
      "read several surfaces before proposing (the default 16 is tight for orientation).",
    ].join("\n"),
    next: ["storytree agents session-orchestrator", "storytree tree"],
  };
}

function coverageHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree coverage <capability-id> — does every declared contract have an observed test? (ADR-0020).",
      "",
      "A signed --real green attests the ONE authored test the gate observed (ADR-0020 §3) — it cannot",
      "forge it, but it never checks that EVERY `## Contracts` behaviour has a test (the leaf reliably",
      "drops the hardest one). This flags the gap: a contract no SUBSTANTIVE test covers (the",
      '`describe("<id>: …")` convention) is reported UNCOVERED.',
      "",
      "  storytree coverage <capability-id>   classify the capability's contracts (offline, read-only)",
      "",
      "Exits non-zero when a contract is uncovered (a green would over-claim); a fully-covered unit passes.",
      "A test must RUN and ASSERT to count (ADR-0126): a hollow `assert(true)` (or a skipped test) under",
      "the right name does NOT cover its contract. A substantive-but-irrelevant assertion still reads",
      "covered — judging that is the deeper semantic-reviewer follow-on.",
    ].join("\n"),
    next: ["storytree tree", "storytree coverage <capability-id>"],
  };
}

async function libraryHelp(store: Store): Promise<Envelope> {
  return {
    ok: true,
    body: [
      "storytree library — explore + curate the Library (the knowledge tier).",
      "",
      "  storytree library                          health + dashboard + commands",
      "  storytree library --check                  live health report (GATE-class fails exit 1)",
      "  storytree library artifact <id>            view one artifact",
      "  storytree library artifact list <category> list a category",
      "  storytree library artifact new|edit <id>   create / edit (writes need --pg)",
      "  storytree library tree focus <id>          the local DAG of one artifact",
      "  storytree library graduate [--review]      agent-memory → Library worklist (ADR-0095)",
      "  (coming soon: artifact comment)",
    ].join("\n"),
    // The "explore just-in-time, drill in to earn the detail" stance is the library's doctrine, not
    // prose restated here (ADR-0029 §7) — surfaced as a pointer the agent can drill into (ADR-0023).
    doctrine: [await renderDoctrine(store, "pull-based-context-architecture")],
    next: ["storytree library"],
  };
}

function artifactHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree library artifact — view and (soon) author Library artifacts.",
      "",
      "  storytree library artifact <id>             print an artifact to stdout",
      "  storytree library artifact <id> --raw <field>   ONE field's exact stored bytes, alone",
      "  storytree library artifact list <category>  list artifacts in a category",
      "  storytree library artifact new --json '<doc>' | --file <p>   create (needs --pg)",
      "  storytree library artifact edit <id> --set <field>=<value>   edit (needs --pg)",
      "  storytree library artifact retire <id> --reason \"...\" [--superseded-by <ref>]   retire (needs --pg)",
      "  (coming soon: comment <id>)",
      "",
      "`--raw <field>` is the ONE read that breaks the envelope convention on purpose: it writes the",
      "value ALONE to stdout — no heading, no doctrine, no next: — so it pipes to a file and composes",
      "with `edit --set <field>=@<that file>`. Nothing that expects an envelope can consume it.",
    ].join("\n"),
    next: ["storytree library", "storytree library artifact list <category>"],
  };
}

export interface RunDeps {
  readonly store: Store;
  /** True when the store persists across sessions (the live --pg store). Writes require it. */
  readonly writable?: boolean;
  /** Recorded as the event `actor` on writes (per-session attribution). Defaults to "cli". */
  readonly actor?: string;
  /**
   * The offer id THIS invocation's `library artifact <id>` render will record (ADR-0260 D3), so the
   * follow-up commands it prints can name it and a later read can answer it. Pre-minted in `main.ts`
   * — the render has to print the id before capture writes it, and both must be the SAME id.
   *
   * Absent for every shape that will record no offer, so a printed follow-up never carries an id
   * naming a candidate set nothing recorded. Absent in tests too, which is why `viewArtifact` renders
   * its ordinary nav unchanged when it is missing.
   */
  readonly offerId?: string;
  /**
   * The session seam (ADR-0033, presence RETIRED by ADR-0200 D7): `identity` is injectable for
   * tests — when ABSENT it is derived from the enclosing worktree. `claims` (ADR-0142) is the
   * write-claim store: `declare --node` takes the work-time claim (the wisp), `done` bulk-releases
   * the session's claims; null/absent offline. (The key keeps its historical `presence` name
   * through wave 1 — every seam behind it is the claim ledger.)
   */
  readonly presence?: {
    readonly identity?: SessionIdentity | null;
    readonly claims?: SessionClaimStoreLike | null;
    /**
     * The graded claim-ledger slice (ADR-0200 D2): the wider store surface the noticeboard
     * claim/upgrade/downgrade/release/claims verbs drive. The same live `PgClaimStore` instance
     * as `claims` when --pg; null/absent offline — the ledger verbs then refuse politely.
     * The read half (`Partial<…>`, ADR-0200 D7) is what the board renders, what `worktree prune
     * --pg` consults for live sessions (D6), and what `branch next` re-takes from — `PgClaimStore`
     * carries it; a fake without it (older tests) simply degrades each surface offline-silently.
     */
    readonly ledger?:
      | (ClaimLedgerStoreLike &
          Partial<ClaimLedgerReadLike> &
          // The LIVE-set read, kept alongside `ClaimLedgerReadLike`'s unfiltered `listAllClaims`
          // (ADR-0346 D1 companion work) because they answer different questions: the board must
          // see stale rows to MARK them, while `worktree prune --pg` asks "is a session live here"
          // and a ghost's row must not protect a dead worktree from the reaper.
          Partial<{ listLiveClaims(): Promise<ClaimDocT[]> }> &
          Partial<{ claimsBySession(sessionId: string): Promise<ClaimDocT[]> }> &
          // The AUDIT-log read half (`noticeboard history`, ADR-0310 D1) — `PgClaimStore` carries
          // it; a fake without it degrades that one verb to its offline refusal, exactly as the
          // read halves above degrade the board.
          Partial<ClaimHistoryStoreLike>)
      | null;
  };
  /**
   * The claim NAMESPACE (ADR-0310 D2): resolves a claimed unit id to a real story / capability /
   * contract / arc / increment, so `noticeboard claim`, `noticeboard upgrade`, `noticeboard declare
   * --node` and `worktree create --node` refuse an id that names nothing rather than writing a row
   * that protects nothing.
   *
   * DELIBERATELY NOT DEFAULTED HERE. `main.ts` supplies it, and only under `--pg`, because only the
   * composition root knows that `store` is the live corpus. Defaulting it from `deps.store` would
   * hand every test holding an `InMemoryStore` a universe that is EMPTY and yet reports itself
   * COMPLETE — which is exactly the shape that refuses legitimate claims. Absent/null = unchecked,
   * the pre-ADR-0310 behaviour, which is what every test sees unless it injects one.
   */
  readonly claimUniverse?: ClaimUniverseLoader | null;
  /**
   * The verdict event log (verdict-glyphs): the live work-store slice when --pg; null/absent
   * offline — the tree's glyph column is then silently absent (never an error).
   */
  readonly verdicts?: VerdictReaderLike | null;
  /**
   * The attestation log (ADR-0044 `attestation-signals`): the live store when --pg;
   * null/absent offline — `storytree attest` then refuses (writes/reads both need it).
   */
  readonly attestations?: AttestationStoreLike | null;
  /**
   * The verdict event log as a WRITE surface (ADR-0082 `uat attest`): the live work store when --pg
   * (the same PgWorkStore as `verdicts`, here typed to expose `appendEvent`); null/absent offline —
   * `storytree uat attest` then refuses (a verdict that does not persist greens nothing).
   */
  readonly uatStore?: UatVerdictStoreLike | null;
  /** The stories/ root the tree view reads. Injectable for tests; defaults to the repo's. */
  readonly storiesDir?: string;
  /**
   * The ADR-number allocator (ADR-0050): the live store when --pg; null/absent offline — `storytree
   * adr new` then falls back to max+1 with a loud "not reserved" warning. Injectable for tests.
   */
  readonly adr?: AdrAllocatorLike | null;
  /** The docs/decisions dir `storytree adr` scans + scaffolds into. Injectable for tests. */
  readonly adrDecisionsDir?: string;
  /**
   * The composition-root clock, injectable so a DATE-stamping command is provable across a timezone
   * boundary — a fixed instant that falls on different days in UTC and in the owner's zone is the
   * only honest red for the `adr new --decided` stamp. Read through {@link ownerLocalDate}; absent
   * in production, where the real `new Date()` is used.
   */
  readonly now?: () => Date;
  /**
   * The `storytree increment check` git seam (ADR-0183 D2): commits touching a path since the
   * increment's anchor sha (the verb was `plan check` until ADR-0305 D1 folded the kind).
   * Injectable so the freshness check is provable offline; defaults to the real
   * `git rev-list --count <sha>..HEAD -- <path>` against the repo root.
   */
  readonly planCountCommits?: CountCommitsSince;
  /**
   * The headless-orchestrator entry's test seam (ADR-0108 Phase 1): an injected scripted `queryFn`
   * lets `storytree orchestrate` be proven offline (no live SDK spend). Absent in production — the
   * command then omits it and `runHeadlessOrchestrator` uses the real SDK `query()` (the live leg).
   */
  readonly orchestrate?: { readonly queryFn?: SdkQueryFn };
  /**
   * The `storytree branch` seams (ADR-0142): an injected `runGit`/`generateName` make the
   * dead-branch detection + fresh cut offline-testable (the deriveIdentity pattern). Absent in
   * production — real git and a random claude/<name> are used.
   */
  readonly branch?: {
    readonly runGit?: (args: readonly string[]) => string;
    readonly generateName?: () => string;
  };
  /**
   * The `storytree worktree prune` seam (ADR-0142 / ADR-0033): an injected {@link WorktreeIo} (git +
   * fs) and clock make the destructive reaper offline-testable — no real git worktrees removed, no
   * real fs touched. Absent in production — real git and fs are used.
   */
  readonly worktree?: {
    readonly io?: WorktreeIo;
    readonly now?: () => number;
    /**
     * The drain-ledger seam (worktree-reaper-integrity-arc strand 3) — an in-memory ledger keeps the
     * drain-health series offline-testable without writing a real `.prune-history.jsonl`.
     */
    readonly drain?: DrainLedgerIo;
    /**
     * The `storytree worktree create` seams (ADR-0200 D3) — injected IO (git/fs/pnpm), arc stamps,
     * and suffix draws keep the claim-gated ceremony offline-testable (no real worktree cut, no real
     * install). Absent in production — real git/fs/pnpm, `storyArcStamps`, and random hex are used.
     * The ledger itself rides `presence.ledger` (the same live claim store as the noticeboard verbs).
     */
    readonly createIo?: WorktreeCreateIo;
    readonly stamps?: () => ReadonlyArray<{ story: string; arc: string }>;
    readonly generateSuffix?: () => string;
  };
  /**
   * The `storytree desktop launch` seam: an injected `spawn`/`repoRoot`/`platform` make the
   * detached-launch path offline-testable (no real Electron process spawned, no real repo touched).
   * Absent in production — the real node:child_process spawn, this repo's root, and process.platform
   * are used.
   */
  readonly desktop?: {
    readonly spawn?: DesktopSpawnFn;
    readonly repoRoot?: string;
    readonly platform?: NodeJS.Platform;
    /** `install-shortcut` seams — an injected .lnk writer + Electron resolver keep it offline-testable. */
    readonly createShortcuts?: CreateShortcutsFn;
    readonly resolveElectron?: ResolveElectronFn;
  };
  /**
   * The `storytree friction` seam (ADR-0168 inc 2): the capture context — branch (the provenance +
   * cap-3 key), clock, and the inbox/docs dirs — is injected so the whole surface is offline-testable
   * without git, a real clock, or the real repo tree. Absent in production: `branch` derives from git,
   * `now` from the clock, and the dirs from the repo root.
   */
  readonly friction?: {
    readonly branch?: string;
    readonly now?: string;
    readonly inboxDir?: string;
    readonly docsDir?: string;
    readonly nodeExists?: (nodeId: string) => boolean;
  };

  /**
   * The `storytree factory health` seam (ADR-0316): the git walk and the clock, injected so the
   * report is testable without a repository. Absent in production — the trunk history comes from
   * `git log` / `git diff --name-only` at the repo root, and the default window from the clock.
   */
  readonly factory?: {
    readonly repoRoot?: string;
    readonly now?: string;
    readonly commits?: (ref: string) => CommitRec[];
    readonly absorbed?: (commit: CommitRec) => string[];
  };
}

/** Assemble the friction capture context, deriving the git/clock/path defaults the tests inject. */
function makeFrictionContext(deps: RunDeps): FrictionContext {
  const root = repoRoot();
  const storiesDir = path.join(root, "stories");
  return {
    branch: deps.friction?.branch ?? currentBranch(),
    now: deps.friction?.now ?? new Date().toISOString(),
    inboxDir: deps.friction?.inboxDir ?? path.join(root, "docs", "friction-inbox"),
    docsDir: deps.friction?.docsDir ?? path.join(root, "docs"),
    // The `node:<id>` resolver (ADR-0107 D2), fs-backed here so `friction.ts` stays free of the
    // stories/ layout — the `docExists` injection pattern. `findNodeSpecFile` is the ONE place that
    // knows a story is `<id>/story.md` and a capability is `<story>/<id>.md`.
    nodeExists: deps.friction?.nodeExists ?? ((nodeId) => findNodeSpecFile(storiesDir, nodeId) !== null),
  };
}

/** Best-effort current git branch (recorded on an ADR allocation for audit); "unknown" if git can't answer. */
function currentBranch(): string {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * The session repo's git state an operator attestation pins itself to (ADR-0082): the HEAD it attests
 * and whether the tree is clean. Null when git can't answer (no repo / git missing) — `uat attest`
 * then refuses, because a verdict must pin a real commit.
 */
function readGitState(): GitState | null {
  try {
    const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (commitSha.length === 0) return null;
    const porcelain = execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return { commitSha, clean: porcelain.trim().length === 0 };
  } catch {
    return null;
  }
}

/** A story's declared UAT test criteria (parsed from `stories/<id>/story.md`); `[]` for a missing/odd spec. */
function loadStoryUatTestCriteria(storiesDir: string, storyId: string): UatTestCriterion[] {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file)) return [];
  try {
    return loadNodeSpec(file).uatTestCriteria;
  } catch {
    return [];
  }
}

/** A story's reliability gates (parsed from `stories/<id>/story.md`, ADR-0085); `[]` for a missing/odd spec. */
function loadStoryReliabilityGates(storiesDir: string, storyId: string): ReliabilityGate[] {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file)) return [];
  try {
    return loadNodeSpec(file).reliabilityGates;
  } catch {
    return [];
  }
}

/**
 * A story's adoptable facts for the adopt-plan classifier (ADR-0097 Layer 2): its status + declared
 * capabilities + reliability gates. Null for a missing/odd spec or a non-story tier (a capability has
 * no caps/gates of its own to classify).
 */
function loadAdoptPlanStory(storiesDir: string, storyId: string): AdoptPlanStory | null {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file)) return null;
  try {
    const spec = loadNodeSpec(file);
    if (spec.tier !== "story") return null;
    return { status: spec.status, capabilities: spec.capabilities, gates: spec.reliabilityGates };
  } catch {
    return null;
  }
}

/** The directory prefix of a test glob, up to (not including) its first wildcard segment. */
function globBaseDir(glob: string): string {
  const base: string[] = [];
  for (const seg of glob.split("/")) {
    if (seg.includes("*")) break;
    base.push(seg);
  }
  return base.join("/");
}

/** Recursively collect `*.test.ts` files under an absolute dir (a missing/odd dir yields none). */
function walkTestFiles(absDir: string): string[] {
  const out: string[] = [];
  try {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const full = path.join(absDir, entry.name);
      if (entry.isDirectory()) out.push(...walkTestFiles(full));
      else if (entry.isFile() && entry.name.endsWith(".test.ts")) out.push(full);
    }
  } catch {
    // A missing / unreadable directory yields no test files.
  }
  return out;
}

/**
 * A capability's coverage facts for the contract-coverage check (ADR-0020 follow-on): its declared
 * `## Contracts` ids + the VOUCHING test names across its proof surface (ADR-0126 — a test only counts
 * if it runs and asserts substantively, so a hollow `assert(true)` is excluded). Null for a missing/odd
 * spec. The proof surface is the union of the registered real-build test file (the EXACT file a signed
 * `--real` green attests — the tightest honest signal for the gap) and the real proof scope's test
 * globs. A config without a real arm keeps the package/dir walk over its ordinary proof scope.
 * Pure-by-injection seam for `coverageCommand`.
 */
function loadCoverageUnit(storiesDir: string, root: string, unitId: string): CoverageUnit | null {
  const file = findNodeSpecFile(storiesDir, unitId);
  if (file === null) return null;
  let spec: ReturnType<typeof loadNodeSpec>;
  try {
    spec = loadNodeSpec(file);
  } catch {
    return null;
  }
  const real = spec.buildConfig?.real;
  const globs = real?.scope.testGlobs ?? spec.buildConfig?.scope.testGlobs ?? [];
  const scopedFiles = globs.flatMap((glob) => {
    const absolute = path.join(root, glob);
    return glob.includes("*") ? walkTestFiles(path.join(root, globBaseDir(glob))) : [absolute];
  });
  // ADR-0353: union in the READ-ONLY coverage surface, exactly as the gate sweep does. Both readers
  // MUST resolve the same surface — a per-capability report that disagreed with the sweep would be
  // the checker contradicting itself on the one question it exists to answer.
  const coverageFiles = (spec.buildConfig?.coverage?.testGlobs ?? []).flatMap((glob) =>
    glob.includes("*")
      ? walkTestFiles(path.join(root, globBaseDir(glob)))
      : [path.join(root, glob)],
  );
  const absFiles = [
    ...(real?.testFile !== undefined ? [path.join(root, real.testFile)] : []),
    ...scopedFiles,
    ...coverageFiles,
  ].filter((candidate, index, files) => files.indexOf(candidate) === index);
  const existing = absFiles.filter((f) => existsSync(f));
  const testNames: string[] = [];
  let unreadTitles = 0;
  for (const f of existing) {
    try {
      // VOUCHING names only (ADR-0126): a hollow / skipped test contributes nothing, so its contract
      // reads uncovered. `unreadTitles` rides along so the report can distinguish a contract NO test
      // names from one whose test has a title the static reader could not read.
      const surface = readTestSurface(readFileSync(f, "utf8"));
      testNames.push(...surface.vouching);
      unreadTitles += surface.unreadTitles;
    } catch {
      // An unreadable test file contributes no names (fail-closed toward "uncovered").
    }
  }
  return {
    tier: spec.tier,
    contractIds: spec.contracts.map((c) => c.id),
    testNames,
    testFiles: existing.map((f) => path.relative(root, f).replace(/\\/g, "/")),
    unreadTitles,
  };
}

/**
 * A story's adoptable facts for the adopt RUN engine (ADR-0097 / ADR-0106): its authored status, its
 * declared reliability gates, and its UAT legs. Null for a missing/odd spec or a non-story tier (a
 * capability has no gates/legs of its own to adopt). Mirrors {@link loadAdoptPlanStory}, which projects
 * the PLAN's fields (caps + gates) off the same spec — the run path needs gates + legs instead.
 */
function loadAdoptStory(storiesDir: string, storyId: string): AdoptStory | null {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file)) return null;
  try {
    const spec = loadNodeSpec(file);
    if (spec.tier !== "story") return null;
    return { status: spec.status, reliabilityGates: spec.reliabilityGates, uatTestCriteria: spec.uatTestCriteria };
  } catch {
    return null;
  }
}

/**
 * The live status-flip writer the adopt RUN wires (ADR-0097): rewrite a story.md's frontmatter
 * `status: mapped → proposed` on disk. The byte-preserving, fail-closed rewrite is drive's pure
 * {@link flipFrontmatterStatus} (it refuses anything but a mapped→proposed flip); this is the thin fs
 * wrapper — read, flip, and write back ONLY when it actually changed (re-adopting a `proposed` story is
 * a clean no-op). The flip is the LAST step of adopt, so the one-line dirtied tree is the operator's to commit.
 */
function flipStatusToProposedFile(storiesDir: string, storyId: string): FlipResult {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file)) return { ok: false, reason: `story.md not found for "${storyId}"` };
  const raw = readFileSync(file, "utf8");
  const flipped = flipFrontmatterStatus(raw, "mapped", "proposed");
  if (flipped.ok && flipped.changed) writeFileSync(file, flipped.content);
  return flipped;
}

/**
 * The spine's out-of-band observation of a reliability gate's declared command (ADR-0085): split the
 * free command string into an argv, make it spawnable on this platform (the win32 `pnpm` `.cmd`
 * rewrap), run it at the repo root with the shared {@link runShellCommand}, and surface ONLY the exit
 * code. No shell (`execFile` of file+args, injection-safe); a non-zero exit is data, not a throw.
 */
async function observeCommand(command: string): Promise<{ code: number | null }> {
  const parts = command.trim().split(/\s+/);
  const file = parts[0];
  if (file === undefined) return { code: null };
  const cmd = platformShellCommand({ file, args: parts.slice(1), cwd: repoRoot() });
  try {
    const out = await runShellCommand(cmd);
    return { code: out.code };
  } catch {
    // A genuine spawn failure (ENOENT) — the command did not run, so it did not pass (fail-closed).
    return { code: null };
  }
}

/**
 * ADR-0081 (amends ADR-0060): the in-memory verdict store is no longer a build OPTION. A `--live`/
 * `--real` build always persists to the live store so real work feeds the studio's wisp/bloom — there
 * is no run-without-persisting mode — and a `--dry-run` is already in-memory. The CLI refuses
 * `--store memory` here, at the dispatch boundary; the internal `verdictStore:"memory"` injection
 * (the offline test seam for the live/real driver) is untouched because it is not reachable from argv.
 */
function refuseMemoryStore(area: "node" | "story" | "gate", id: string | undefined): Envelope {
  // The retry hint mirrors the area's own verb: node/story `build`, a gate `run --real`.
  const retry =
    area === "gate"
      ? `storytree gate run ${id ?? "<story>#gate-<n>"} --real --pg   (a --real gate build persists by default)`
      : `storytree ${area} build ${id ?? "<id>"} --live   (persists by default — no --store needed)`;
  return {
    ok: false,
    body:
      "--store memory is no longer a build option (ADR-0081, supersedes part of ADR-0060): a --live/--real build\n" +
      "always persists to the live store so real work feeds the studio's wisp/bloom — there is no\n" +
      "run-without-persisting mode. A --dry-run is already in-memory; just drop --store. If the live\n" +
      "store is down, bring it up rather than skipping it.",
    next: ["pnpm db:status", retry],
  };
}

// ---------------------------------------------------------------------------
// build workflow (ADR-0118 — workflow-first CLI surface)
// ---------------------------------------------------------------------------

/** The argv subset the build/gate helpers read (a structural slice of `run`'s parsed `values`). */
interface BuildValues {
  "dry-run"?: boolean;
  live?: boolean;
  real?: boolean;
  "emit-wisp"?: boolean;
  dwell?: string;
  model?: string;
  runtime?: string;
  budget?: string;
  "max-turns"?: string;
  actor?: string;
  store?: string;
  signer?: string;
}

/**
 * The node/story build options threaded from argv. Both `build node` and `build story` (and their
 * `node build`/`story build` back-compat aliases) take the SAME shape, so it is built once here — the
 * single source the dispatch routes into, never re-typed per area (ADR-0118: relocate the primitive,
 * don't fork it).
 */
export function nodeStoryBuildOpts(values: BuildValues) {
  return {
    dryRun: values["dry-run"] === true,
    live: values.live === true,
    real: values.real === true,
    emitWisp: values["emit-wisp"] === true,
    ...(values.dwell !== undefined ? { dwellSec: Number(values.dwell) } : {}),
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(values.runtime !== undefined ? { runtime: values.runtime } : {}),
    ...(values.budget !== undefined ? { budgetUsd: Number(values.budget) } : {}),
    ...(values["max-turns"] !== undefined ? { maxTurns: Number(values["max-turns"]) } : {}),
    ...(values.actor !== undefined ? { actor: values.actor } : {}),
    ...(values.store !== undefined ? { verdictStore: values.store } : {}),
    onLeafSlices: captureBuildLeafSlices,
  };
}

/**
 * Wire a build's spawned leaf slices onto the context-traversal spawn adapter (ADR-0235/ADR-0241).
 *
 * The wiring lives HERE, not in drive: `context-traversal-spawn` reaches
 * `context-traversal-capture` → `context-traversal-telemetry`, whose UAT proves itself against
 * drive's real `createOrientationRunner`, so a direct `drive → spawn` import closes a cross-story
 * cycle `check:boundaries` refuses. The CLI is the declared consumer of every organism it surfaces
 * (ADR-0074 §4), so it is the right owner of this edge — and of the session identity, resolved with
 * exactly `captureInvocation`'s precedence in `main.ts` (`STORYTREE_SESSION_ID`, then the worktree
 * derivation) so a session's build lane and its CLI reads land in the SAME trace file.
 *
 * Additive and fail-silent (ADR-0241 D3): `captureBuildSpawn` never throws, and the `catch` here is
 * the belt-and-braces the envelope deserves — telemetry must never change a build's outcome.
 */
function captureBuildLeafSlices(args: {
  readonly runId: string;
  readonly unitId: string;
  readonly runs: readonly LeafSliceRun[];
}): void {
  try {
    const override = process.env["STORYTREE_SESSION_ID"];
    const parentSessionId =
      override !== undefined && override.trim().length > 0
        ? override
        : (deriveIdentity()?.sessionId ?? null);
    captureBuildSpawn({ parentSessionId, runId: args.runId, unitId: args.unitId, runs: args.runs });
  } catch {
    // A trace is a courtesy; the build's envelope is the payload.
  }
}

/**
 * Classify a bare `build <id>` target by tier — the CLI mirror of the studio's `routedBuildRunner`
 * (ADR-0118 / ADR-0090): a unit whose spec is a `story` routes to the whole-story chain, anything else
 * (a capability/leaf node — or an unknown id, which `nodeBuild` then guides on) to a single-node build.
 * Pure over the stories dir; the auto-route forwards the operator's explicit flags (the CLI is a
 * superset of the UI — it does not pin `--real`/openPr the way the single studio Build button does).
 */
export function classifyBuildTarget(id: string, storiesDir: string): "node" | "story" {
  const file = findNodeSpecFile(storiesDir, id);
  if (file === null) return "node";
  try {
    return loadNodeSpec(file).tier === "story" ? "story" : "node";
  } catch {
    return "node";
  }
}

/** The `gate` invocation opts (signer + the build-tests `--real` switch), shared by `gate` and `build gate`. */
function makeGateOpts(values: BuildValues): GateOpts {
  return {
    ...(values.signer !== undefined ? { signer: values.signer } : {}),
    ...(values.real === true ? { real: true } : {}),
  };
}

/**
 * Wire the live `gate` seams (verdict store, gate/UAT loaders, git state, the observe runner, the
 * signer resolver, the build-tests driver, the clock) — shared by the `gate` area and the new
 * `build gate` entry so the two are literally one code path (ADR-0118 back-compat aliasing).
 */
function makeGateDeps(deps: RunDeps, values: BuildValues, storiesDir: string): GateDeps {
  return {
    store: deps.uatStore ?? null,
    loadReliabilityGates: (storyId) => loadStoryReliabilityGates(storiesDir, storyId),
    loadUatTestCriteria: (storyId) => loadStoryUatTestCriteria(storiesDir, storyId),
    gitState: readGitState,
    observe: observeCommand,
    resolveSigner: (flag?: string) => resolveSignerFromEnv(flag !== undefined ? { flag } : undefined),
    driveBuildTestsGate: (gate, signer) =>
      driveBuildTestsGate(gate, signer, {
        storiesDir,
        repoRoot: repoRoot(),
        ...(values.store !== undefined ? { verdictStore: values.store } : {}),
        ...(values.model !== undefined ? { model: values.model } : {}),
        ...(values.runtime !== undefined ? { runtime: values.runtime } : {}),
        ...(values.budget !== undefined ? { budgetUsd: Number(values.budget) } : {}),
        ...(values["max-turns"] !== undefined ? { maxTurns: Number(values["max-turns"]) } : {}),
      }),
    now: () => new Date(),
  };
}

/**
 * `storytree build` — the build WORKFLOW help (ADR-0118). Surfaces the goal (drive red→green) at the
 * top, the tier auto-route, and the nested grain primitives; the moved verbs keep working as aliases.
 */
function buildHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree build — drive red→green (ADR-0118): the build workflow, mirroring the studio's Build button.",
      "",
      "  storytree build <id> [flags]                   AUTO-ROUTE by tier — a story id drives the whole-story",
      "                                                 chain, anything else a single node (mirrors the studio).",
      "  storytree build node <id> [flags]              drive ONE node through the prove-it-gate (was `node build`)",
      "  storytree build node resolve <id>              FREE, read-only: how a node spec resolves (was `node resolve`)",
      "  storytree build story <id> [flags]             drive a WHOLE story's nodes in dependency order (was `story build`)",
      "  storytree build gate <story>#gate-<n> --real   earn a build-tests gate by a real red→green (was `gate run --real`)",
      "",
      "flags: --dry-run (scripted, offline) · --live (subscription leaf smoke) · --real (real build)",
      "       --runtime claude|codex (default: claude) · --model <runtime-model-id>",
      "       --budget <usd> (Claude only) · --max-turns <n>",
      "",
      "An `observe` gate is NOT a build — it is observe-and-signed by adoption: `storytree adopt gate <id>`.",
      "The moved verbs keep working as back-compat aliases (`node build`, `node resolve`, `story build`,",
      "`gate run --real`), so no script or habit breaks — they just relocate under the build workflow.",
    ].join("\n"),
    next: ["storytree build node library-cli --dry-run", "storytree build story library --dry-run"],
  };
}

// ---------------------------------------------------------------------------
// witness workflow (ADR-0118 — the human/operator proof workflow)
// ---------------------------------------------------------------------------

/** The session/agent identity for the proof commands (injected by tests; else derived from the worktree). */
function sessionIdentity(deps: RunDeps): SessionIdentity | null {
  return deps.presence !== undefined && deps.presence.identity !== undefined
    ? deps.presence.identity
    : deriveIdentity();
}

/** The per-test UAT opts threaded from argv — shared by `uat` and `witness list/attest` (one code path). */
function makeUatOpts(values: { outcome?: string; signer?: string; note?: string }) {
  return {
    ...(values.outcome !== undefined ? { outcome: values.outcome } : {}),
    ...(values.signer !== undefined ? { signer: values.signer } : {}),
    ...(values.note !== undefined ? { note: values.note } : {}),
  };
}

/** Wire the live UAT seams (verdict store, test loader, git state, identity, signer, clock). */
function makeUatDeps(deps: RunDeps, identity: SessionIdentity | null, storiesDir: string): UatDeps {
  return {
    store: deps.uatStore ?? null,
    loadUatTestCriteria: (storyId) => loadStoryUatTestCriteria(storiesDir, storyId),
    gitState: readGitState,
    identity,
    resolveSigner: (flag?: string) => resolveSignerFromEnv(flag !== undefined ? { flag } : undefined),
    now: () => new Date(),
  };
}

/** The attestation-vouch opts threaded from argv — shared by `attest` and `witness vouch`. */
function makeAttestOpts(values: {
  outcome?: string;
  witness?: string;
  signer?: string;
  "relayed-by"?: string;
  note?: string;
}) {
  return {
    ...(values.outcome !== undefined ? { outcome: values.outcome } : {}),
    ...(values.witness !== undefined ? { witness: values.witness } : {}),
    ...(values.signer !== undefined ? { signer: values.signer } : {}),
    ...(values["relayed-by"] !== undefined ? { relayedBy: values["relayed-by"] } : {}),
    ...(values.note !== undefined ? { note: values.note } : {}),
  };
}

/** Wire the live attestation seams (store, identity, signer, clock) — shared by `attest` and `witness vouch`. */
function makeAttestDeps(
  deps: RunDeps,
  identity: SessionIdentity | null,
  storiesDir: string,
): AttestDeps {
  return {
    store: deps.attestations ?? null,
    loadUatTestCriteria: (storyId) => loadStoryUatTestCriteria(storiesDir, storyId),
    identity,
    resolveSigner: (flag?: string) => resolveSignerFromEnv(flag !== undefined ? { flag } : undefined),
    now: () => new Date(),
  };
}

/**
 * `storytree witness` — the human/operator proof WORKFLOW (ADR-0118). It cuts across adopt AND build
 * (you witness a story's UAT whether it was adopted or built), so it is its OWN top-level workflow, not
 * nested under either. The per-test UAT proof (`witness list`/`witness attest`) and the lower-rigor vouch
 * (`witness vouch`) relocate here from `uat`/`attest`, which keep working as back-compat aliases.
 */
function witnessHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree witness — the human/operator proof workflow (ADR-0118): witness a story's UAT, whether",
      "it was adopted or built (it cuts across both, so it is its own workflow).",
      "",
      "  storytree witness list <story-id> [--pg]            a story's UAT test criteria + proven state (was `uat list`)",
      "  storytree witness attest <story-id> <uatc_id> --pg   sign an exact-revision operator verdict (was `uat attest`)",
      "  storytree witness vouch <story-id> <uatc_id> --pg    record an exact-revision lower-rigor vouch (was `attest`)",
      "  storytree witness vouch list <stored-key> --pg       current or preserved legacy vouch history",
      "",
      "`witness attest` mints a real `operator-attested` verdict (events.verdict) — it can green a story's",
      "UAT. A `witness vouch` is a signal only (events.attestation), never greens the story (ADR-0044). The",
      "moved verbs keep working as back-compat aliases (`uat list`, `uat attest`, `attest`).",
    ].join("\n"),
    next: ["storytree witness list <story-id> --pg", "storytree tree <story-id> --pg"],
  };
}

/**
 * Every flag the CLI declares, as ONE table at module scope.
 *
 * Hoisted out of `run`'s `parseArgs` call so it can be ENUMERATED (`at-path.test.ts`): the
 * `@path` boundary classifies each string flag as prose or literal, and its exhaustiveness guard
 * reads this object rather than a hand-kept second list that could drift from it. Adding a flag
 * here and nowhere else fails that guard, which is the point — the classification cannot be
 * forgotten (cli-write-fidelity-arc).
 */
export const CLI_OPTIONS = {
  pg: { type: "boolean", default: false },
  check: { type: "boolean", default: false },
  help: { type: "boolean", short: "h", default: false },
  json: { type: "string" },
  file: { type: "string" },
  set: { type: "string", multiple: true },
  raw: { type: "string" },
  "decided-date": { type: "string" },
  "dry-run": { type: "boolean", default: false },
  // `storytree guide --fix` — opt in to enacting the D6 repairs (ADR-0207).
  fix: { type: "boolean", default: false },
  live: { type: "boolean", default: false },
  real: { type: "boolean", default: false },
  "emit-wisp": { type: "boolean", default: false },
  dwell: { type: "string" },
  model: { type: "string" },
  budget: { type: "string" },
  "max-turns": { type: "string" },
  actor: { type: "string" },
  store: { type: "string" },
  "working-on": { type: "string" },
  node: { type: "string", multiple: true },
  // `storytree noticeboard claim/downgrade` — the claim grade + intent prose (ADR-0200 D2).
  grade: { type: "string" },
  intent: { type: "string" },
  // `storytree noticeboard history` — the claim AUDIT-log read (ADR-0310 D1). `--days` windows
  // (default 30, `all` for the whole log), `--session`/`--type` scope, `--limit` caps the rows,
  // `--refusals`/`--holdings` pick the view. Read-only; nothing here touches a claim.
  days: { type: "string" },
  session: { type: "string" },
  type: { type: "string" },
  limit: { type: "string" },
  refusals: { type: "boolean", default: false },
  holdings: { type: "boolean", default: false },
  outcome: { type: "string" },
  witness: { type: "string" },
  signer: { type: "string" },
  "relayed-by": { type: "string" },
  note: { type: "string" },
  title: { type: "string" },
  // `storytree arc new` — override the card one-liner the scaffolder would otherwise derive
  // from the intent.
  description: { type: "string" },
  supersedes: { type: "string" },
  amends: { type: "string" },
  arc: { type: "string" },
  // `storytree arc new` / `arc edit` / `arc increment add` / `arc close` — the first-class arc
  // write verbs (long prose via @path).
  "end-state": { type: "string" },
  // `storytree arc list --all | --closed` — widen past the default active-only worklist
  // (ADR-0239 D3). `--all` wins when both are passed.
  all: { type: "boolean", default: false },
  closed: { type: "boolean", default: false },
  date: { type: "string" },
  pr: { type: "string" },
  threshold: { type: "string" },
  decided: { type: "boolean", default: false },
  current: { type: "boolean", default: false },
  "load-bearing": { type: "boolean", default: false },
  status: { type: "string" },
  bound: { type: "string" },
  change: { type: "string", multiple: true },
  reason: { type: "string" },
  "superseded-by": { type: "string" },
  "memory-dir": { type: "string" },
  // `storytree library graduate park` — the lease override in days (ADR-0202; default 60). Reused by
  // `storytree question new --lease-days` (ADR-0358 Option 2B; default 7) — same shape, same flag name.
  "lease-days": { type: "string" },
  review: { type: "boolean", default: false },
  readings: { type: "string" },
  // `storytree library export-corpus --id <id>` (repeatable) — scope the live→seed export to
  // named artifacts (ADR-0290), so a session discharges what it authored and carries no
  // sibling's body into its commit.
  id: { type: "string", multiple: true },
  write: { type: "boolean", default: false },
  // `storytree arc reconcile --write --only <close|reopen>` — narrow WHICH drift direction is
  // applied. The report always carries both; this only scopes the write.
  only: { type: "string" },
  step: { type: "string" },
  "agent-type": { type: "string" },
  evidence: { type: "string" },
  route: { type: "string" },
  // `storytree friction route --discharged-by <ref>` — the delivery stamp (remedy landed).
  "discharged-by": { type: "string" },
  // `storytree friction route --re-route` — overwrite ANOTHER adjudicator's standing route on
  // purpose. Without it a foreign route refuses, so a concurrent board drain cannot silently
  // destroy a peer's `routeReason` (measured: 4 items, ~22k chars, 2026-07-30).
  "re-route": { type: "boolean", default: false },
  // `storytree arc increment new --friction <id>` (repeatable) — the source friction an entry
  // remedies, and the DELIVERY CEILING'S JOIN (ADR-0298 D2/D3). `storytree friction route
  // --route tool --arc <id>` names the owning arc on the other side of the same edge; it reuses
  // the `arc` flag declared above rather than the retired `--proposal`.
  friction: { type: "string", multiple: true },
  // `storytree arc increment new|add --cites <ref>` (repeatable, or comma-separated) — the typed
  // work-hierarchy + guidance pointers (ADR-0306 D2): `story:<id>` / `capability:<id>` / `asset:<id>`.
  // It replaces the id-naming half of the `decomposition` prose ADR-0305 D4 removed. A ref that does
  // not resolve is REPORTED on read, never refused here (ADR-0306 D1) — the hierarchy is disk-
  // canonical and branch-dependent, so an increment must be writable against a story its own branch
  // is about to create.
  cites: { type: "string", multiple: true },
  // `storytree arc increment new` — the increment's two body fields (long prose via @path).
  // TWO where the parked entry had seven (ADR-0305 D4): `summary`/`motivation`/`change`/`scope`/
  // `migration`/`readiness`/`risks` are gone from the schema, so the flags that fed them are gone
  // too rather than left inert. `--objective` is the one-sentence lead; everything those headings
  // prompted for goes in `--body`.
  objective: { type: "string" },
  body: { type: "string" },
  // `storytree question new` — the open-question briefing fields (ADR-0314 D5). The four required
  // ones are `KIND_SPECS`' own; `--arc` is declared above and reused. All long prose via @path — the
  // bar is a briefing the owner can answer COLD, which is not a value that fits on a command line.
  stakes: { type: "string" },
  statement: { type: "string" },
  context: { type: "string" },
  options: { type: "string" },
  diagram: { type: "string" },
  recommendation: { type: "string" },
  scope: { type: "string" },
  migration: { type: "string" },
  source: { type: "string" },
  // `storytree worktree prune` — destructive, so force+yes are BOTH required to remove.
  force: { type: "boolean", default: false },
  yes: { type: "boolean", default: false },
  cap: { type: "string" },
  "include-detached": { type: "boolean", default: false },
  "threshold-hours": { type: "string" },
  // `storytree desktop install-shortcut --runtime <path>` — the pinned-main runtime worktree (ADR-0181).
  runtime: { type: "string" },
  // `storytree library artifact <id> --from-offer <candidateSetId>` — the offer an answering
  // read is declaring it followed (ADR-0260 D3). Registered so the flag parses; the VALUE is
  // read from argv by the capture boundary in `main.ts`, never from here.
  "from-offer": { type: "string" },
  // `storytree factory health` — the window and the dispatch-rate reference (ADR-0316 D2). A
  // rate-sensitive figure is refused where `--from`/`--to` bound a window whose landings/day falls
  // below the comparability floor against `--landings-per-day`.
  from: { type: "string" },
  to: { type: "string" },
  "landings-per-day": { type: "string" },
  ref: { type: "string" },
  // `storytree session-cost --project <prefix>` — which transcript project directories to price
  // (ADR-0323 D4). Defaults to this checkout's; `--all` widens to every one. The window itself
  // reuses `--limit` / `--from` / `--to` declared above.
  project: { type: "string" },
  // `storytree session-cost --min-turns <n>` — the SELECTION floor that keeps machine-driven
  // one-shots from filling a recency-ordered window. Their spend is still reported, never hidden.
  "min-turns": { type: "string" },
  // `storytree session-cost --started-after/--started-before <iso>` — select WHOLE sessions by their
  // first turn rather than truncating them at a `--from`/`--to` boundary. The segmentation flag for
  // "did behaviour change after X landed" (ADR-0323 D4's falsifiability).
  "started-after": { type: "string" },
  "started-before": { type: "string" },
} as const;

/**
 * Parse `argv` and dispatch. `--help`/`-h` shows the page for the deepest area reached; `--pg` is a
 * store-selection flag consumed by `main` (declared here so parsing does not reject it). Returns an
 * {@link Envelope}; `main` formats it and maps `ok` to the exit code.
 */
export async function run(argv: readonly string[], deps: RunDeps): Promise<Envelope> {
  let positionals: string[];
  let help: boolean;
  let values: {
    help?: boolean;
    pg?: boolean;
    check?: boolean;
    json?: string;
    file?: string;
    set?: string[];
    /** `library artifact <id> --raw <field>` — the bare-bytes read (see {@link rawField}). */
    raw?: string;
    /** `adr new --decided --decided-date <YYYY-MM-DD>` — override the derived owner-local date. */
    "decided-date"?: string;
    /** `library export-corpus --id <id>` (repeatable) — scope the live→seed export (ADR-0290). */
    id?: string[];
    "dry-run"?: boolean;
    live?: boolean;
    real?: boolean;
    "emit-wisp"?: boolean;
    dwell?: string;
    model?: string;
    budget?: string;
    "max-turns"?: string;
    actor?: string;
    store?: string;
    "working-on"?: string;
    node?: string[];
    grade?: string;
    intent?: string;
    /** `noticeboard history` — the audit-log read's window / scope / view (ADR-0310 D1). */
    days?: string;
    session?: string;
    type?: string;
    limit?: string;
    refusals?: boolean;
    holdings?: boolean;
    outcome?: string;
    witness?: string;
    signer?: string;
    "relayed-by"?: string;
    note?: string;
    title?: string;
    description?: string;
    supersedes?: string;
    amends?: string;
    arc?: string;
    "end-state"?: string;
    all?: boolean;
    closed?: boolean;
    date?: string;
    pr?: string;
    threshold?: string;
    decided?: boolean;
    current?: boolean;
    "load-bearing"?: boolean;
    status?: string;
    bound?: string;
    change?: string[];
    reason?: string;
    "superseded-by"?: string;
    "memory-dir"?: string;
    "lease-days"?: string;
    review?: boolean;
    readings?: string;
    write?: boolean;
    only?: string;
    step?: string;
    "agent-type"?: string;
    evidence?: string;
    route?: string;
    "discharged-by"?: string;
    "re-route"?: boolean;
    friction?: string[];
    cites?: string[];
    objective?: string;
    body?: string;
    /** `question new` — the open-question briefing fields (ADR-0314 D5). */
    stakes?: string;
    statement?: string;
    context?: string;
    options?: string;
    diagram?: string;
    recommendation?: string;
    scope?: string;
    migration?: string;
    source?: string;
    force?: boolean;
    fix?: boolean;
    yes?: boolean;
    cap?: string;
    "include-detached"?: boolean;
    "threshold-hours"?: string;
    runtime?: string;
    "from-offer"?: string;
    /** `factory health` — the window + the dispatch-rate reference (ADR-0316 D2). */
    from?: string;
    to?: string;
    "landings-per-day"?: string;
    ref?: string;
    /** `session-cost` — which transcript project directories to price (ADR-0323 D4). */
    project?: string;
    "min-turns"?: string;
    /** `session-cost` — whole-session segmentation by first turn (ADR-0323 D4). */
    "started-after"?: string;
    "started-before"?: string;
  };
  try {
    const parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: CLI_OPTIONS,
    });
    positionals = parsed.positionals;
    values = parsed.values;
    help = parsed.values.help === true;
  } catch (err) {
    return {
      ok: false,
      body: `bad arguments: ${(err as Error).message}`,
      next: ["storytree library"],
    };
  }

  // The `@path` boundary (cli-write-fidelity-arc): every long-prose flag is expanded from its file
  // HERE, once, before any verb reads it — so a write verb cannot store the literal string
  // `@C:/…/scratch.txt` as its durable record by forgetting to call a helper. An unreadable path
  // refuses the whole command rather than passing the path through as the value.
  {
    const expanded = await expandAtPathFlags(values);
    if (!expanded.ok) {
      return {
        ok: false,
        body: formatAtPathRefusal(expanded.refusal),
        next: [`storytree ${positionals[0] ?? "library"} --help`],
      };
    }
    values = expanded.values;
  }

  const [area, sub, third, fourth] = positionals;

  if (area === undefined) return topHelp(deps.store);

  // `--raw <field>` is REFUSED where it is not read, never ignored (the silent-drop defect below).
  if (values.raw !== undefined && !help && !rawIsRead(area, sub)) {
    return rawUnsupported(area, sub);
  }

  if (area === "node") {
    if (sub === undefined || help) return nodeHelp();
    if (sub === "resolve") {
      // FREE, read-only: how a node spec resolves (no build, no spend). ADR-0057 A discoverability.
      return nodeResolve(third);
    }
    if (sub !== "build") {
      return {
        ok: false,
        body: `unknown node command "${sub}". try: storytree node build <id> --dry-run | storytree node resolve <id>`,
        next: ["storytree node resolve <id>", "storytree node build <id> --dry-run"],
      };
    }
    if (values.store === "memory") return refuseMemoryStore("node", third);
    // `node build <id>` is the back-compat alias for `build node <id>` (ADR-0118) — one code path.
    return nodeBuild(third, nodeStoryBuildOpts(values));
  }

  if (area === "story") {
    if (sub === undefined || help) return storyHelp();
    // ADR-0097 Layer 2's adoption-plan report MOVED to `storytree adopt plan <story>` (the command-surface
    // reshape — adoption actions nest under `adopt`). `story` now drives only the build chain.
    if (sub !== "build") {
      return {
        ok: false,
        body: `unknown story command "${sub}". try: storytree story build <story-id> --dry-run  (adoption-plan moved to: storytree adopt plan <story-id>)`,
        next: ["storytree story build library --dry-run", "storytree adopt plan library"],
      };
    }
    if (values.store === "memory") return refuseMemoryStore("story", third);
    // `story build <id>` is the back-compat alias for `build story <id>` (ADR-0118) — one code path.
    return storyBuild(third, nodeStoryBuildOpts(values));
  }

  if (area === "build") {
    // ADR-0118 — the build WORKFLOW: the top-level goal `build`, with the grain primitives nested.
    // `build <id>` AUTO-ROUTES by tier (mirroring the studio's single Build button / routedBuildRunner);
    // `build node|story|gate` are the explicit primitives the old `node`/`story`/`gate run --real`
    // verbs relocated to (those keep working as back-compat aliases above — one code path each).
    if (help && sub === undefined) return buildHelp();
    if (sub === undefined) return buildHelp();
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");

    if (sub === "node") {
      // `build node resolve <id>` (was `node resolve`) — FREE, read-only spec resolution, no build/spend.
      if (third === "resolve") return nodeResolve(fourth);
      if (third === undefined || help) return nodeHelp();
      if (values.store === "memory") return refuseMemoryStore("node", third);
      return nodeBuild(third, nodeStoryBuildOpts(values));
    }
    if (sub === "story") {
      if (third === undefined || help) return storyHelp();
      if (values.store === "memory") return refuseMemoryStore("story", third);
      return storyBuild(third, nodeStoryBuildOpts(values));
    }
    if (sub === "gate") {
      // `build gate <story>#gate-<n> --real` (was `gate run --real`) — the build-tests primitive. The
      // observe path is NOT here: an observe gate is earned by adoption (`adopt gate`, ADR-0118), not a
      // build. gateRun routes by kind+--real internally, so this is one code path with `gate run`.
      if (third === undefined || help) return gateHelp();
      if (values.store === "memory") return refuseMemoryStore("gate", third);
      return gateCommand(
        { mode: "run", target: third },
        makeGateOpts(values),
        makeGateDeps(deps, values, storiesDir),
      );
    }

    // bare `build <id>` — auto-route by tier (a story → the whole-story chain, else a single node),
    // forwarding the operator's explicit flags (the CLI is a superset of the UI: it does not pin
    // --real/openPr the way the one studio Build button does — the operator says what they want).
    const target = sub;
    const kind = classifyBuildTarget(target, storiesDir);
    if (values.store === "memory") return refuseMemoryStore(kind, target);
    return kind === "story"
      ? storyBuild(target, nodeStoryBuildOpts(values))
      : nodeBuild(target, nodeStoryBuildOpts(values));
  }

  if (area === "noticeboard") {
    if (help) return noticeboardHelp();
    // Identity: injected by tests; otherwise derived from the enclosing worktree (never typed).
    const identity =
      deps.presence !== undefined && deps.presence.identity !== undefined
        ? deps.presence.identity
        : deriveIdentity();
    // `history` — the claim AUDIT-log read (ADR-0310 D1). Routed BEFORE the ledger verbs because it
    // needs no identity (it writes nothing) and drives a different store slice: the append-only
    // `events.claim_event` log rather than the live `node_claim` rows. A fake ledger without the
    // read half degrades to the offline refusal, like every other --pg surface here.
    if (isClaimHistoryVerb(sub)) {
      const auditStore = deps.presence?.ledger ?? null;
      const auditHistory = auditStore?.auditHistory;
      // The LIVE-ROW cross-check. Without it the hold-span fold can only ever reach
      // `unverified`, so the `cleared` rendering — the half that makes the ~205 spans with
      // no closing transition legible rather than merely un-asserted — would be built,
      // tested, and dormant in production. A dormant mechanism is indistinguishable from a
      // working one from the outside, which is the exact class this arc exists to fence.
      const claimsFor = auditStore?.claimsFor;
      return claimHistoryCommand(
        third,
        {
          ...(values.days !== undefined ? { days: values.days } : {}),
          ...(values.session !== undefined ? { session: values.session } : {}),
          ...(values.type !== undefined ? { type: values.type } : {}),
          ...(values.limit !== undefined ? { limit: values.limit } : {}),
          refusals: values.refusals === true,
          holdings: values.holdings === true,
        },
        {
          history:
            auditHistory !== undefined
              ? {
                  auditHistory: (query) => auditHistory.call(auditStore, query),
                  ...(claimsFor !== undefined
                    ? { claimsFor: (unitId: string) => claimsFor.call(auditStore, unitId) }
                    : {}),
                }
              : null,
          now: () => new Date(),
        },
      );
    }
    // The graded claim-ledger verbs (ADR-0200 D2) route to the leaf-proven claimLedgerCommand;
    // declare/done keep the exact noticeboardCommand path below (byte-compatible).
    if (isClaimLedgerVerb(sub)) {
      return claimLedgerCommand(
        sub,
        third,
        {
          ...(values.grade !== undefined ? { grade: values.grade } : {}),
          ...(values.intent !== undefined ? { intent: values.intent } : {}),
        },
        {
          claims: deps.presence?.ledger ?? null,
          identity,
          now: () => new Date(),
          universe: deps.claimUniverse ?? null,
        },
      );
    }
    // (The write-authority receipt was stamped here until ADR-0284 D4 retired it with the hook that
    // was its only consumer. Its removal is what deletes the 12-hour TTL that would have refused a
    // long session mid-work, and the ledger dependency on the write path.)

    // The board's ledger read (ADR-0200 D7): the SAME PgClaimStore that drives the ledger verbs
    // rides `presence.ledger`; capture the method so the narrowing survives the closure (a fake
    // ledger without the read half degrades the board to the empty offline render).
    const ledgerStore = deps.presence?.ledger ?? null;
    const listAllClaims = ledgerStore?.listAllClaims;
    return noticeboardCommand(
      sub,
      {
        ...(values["working-on"] !== undefined ? { workingOn: values["working-on"] } : {}),
        nodes: values.node ?? [],
      },
      {
        identity,
        now: () => new Date(),
        // Claim-at-declare (ADR-0142): the anchored node's work-time claim IS the declare now
        // (presence retired, ADR-0200 D7).
        claims: deps.presence?.claims ?? null,
        // The claim-ledger board render (ADR-0200 D7): the ledger IS the board. The read is the
        // UNFILTERED one (ADR-0346 D1 companion work) — the board renders a stale row marked
        // rather than dropping it and then asserting the ledger is empty.
        ledger:
          listAllClaims !== undefined
            ? { listAllClaims: () => listAllClaims.call(ledgerStore) }
            : null,
        // The claim namespace (ADR-0310 D2) — `declare --node` is a claim-taking path.
        universe: deps.claimUniverse ?? null,
      },
    );
  }

  if (area === "branch") {
    // ADR-0142 — a branch dies on merge. `branch next` succeeds a dead branch in one verb: detect
    // it, cut + switch a fresh claude/<name> from origin/main, and re-take the session's story
    // claims. NOT the default post-merge move (ADR-0271 amends ADR-0142 §3 — a session's working
    // life ends where its PR merges, and new work re-enters through a fresh session), so this is
    // the rare owner-directed in-session continuation. The re-take recurses through the SAME noticeboard
    // declare dispatch above (claim-at-declare re-lighting the story wisp on the fresh branch) —
    // one code path, never a hand-copied claim write. Presence is retired (ADR-0200 D7): the
    // prior nodes are read from the session's own live claims on the ledger.
    if (help || sub === undefined) return branchHelp();
    if (sub !== "next") {
      return {
        ok: false,
        body: `unknown branch command "${sub}". try: storytree branch next`,
        next: ["storytree branch next", "storytree branch --help"],
      };
    }
    const identity = sessionIdentity(deps);
    const ledgerStore = deps.presence?.ledger ?? null;
    const claimsBySession = ledgerStore?.claimsBySession;
    const claimStore = deps.presence?.claims ?? null;
    return branchNext({
      ...(deps.branch?.runGit !== undefined ? { runGit: deps.branch.runGit } : {}),
      ...(deps.branch?.generateName !== undefined ? { generateName: deps.branch.generateName } : {}),
      claims:
        claimsBySession !== undefined
          ? { claimsBySession: (sid) => claimsBySession.call(ledgerStore, sid) }
          : null,
      identity,
      redeclare:
        claimStore !== null
          ? (args) =>
              run(
                [
                  "noticeboard",
                  "declare",
                  "--working-on",
                  args.workingOn,
                  ...args.nodes.flatMap((n) => ["--node", n]),
                ],
                deps,
              )
          : null,
    });
  }

  if (area === "worktree") {
    // ADR-0142 / ADR-0033 — the standing worktree reaper. The merge ceremony cannot self-clean
    // (session identity is worktree-derived, so a merged branch's worktree is REUSED for the next
    // branch; the merge is async on CI after the session stopped; a session can't delete its own cwd),
    // so `.claude/worktrees/` accumulates. `worktree prune` reaps a worktree only once it is provably
    // dead — merged + clean + idle — with the primary, the current worktree, live sessions, dirty
    // trees, and detached gates all held back. Destructive, so a dry run is the default.
    if (help || sub === undefined) return worktreeHelp();
    if (sub === "create") {
      // ADR-0200 D3 — the claim-gated workspace ceremony: exploring claim(s) FIRST (no claim, no
      // workspace), then mint → cut off origin/main → synchronous install → the start payload.
      // The ledger is the SAME live claim store the noticeboard verbs drive (null offline → refuse).
      return createWorktree(
        { nodes: values.node ?? [], intent: values.intent ?? "" },
        {
          ledger: deps.presence?.ledger ?? null,
          // The claim namespace (ADR-0310 D2) — this ceremony BORNS a session claimed, so a
          // phantom id here mints a whole worktree around a claim on nothing.
          universe: deps.claimUniverse ?? null,
          ...(deps.worktree?.createIo !== undefined ? { io: deps.worktree.createIo } : {}),
          ...(deps.worktree?.stamps !== undefined ? { stamps: deps.worktree.stamps } : {}),
          ...(deps.worktree?.generateSuffix !== undefined
            ? { generateSuffix: deps.worktree.generateSuffix }
            : {}),
        },
      );
    }
    if (sub !== "prune" && sub !== "drain") {
      return {
        ok: false,
        body: `unknown worktree command "${sub}". try: storytree worktree create | storytree worktree prune | storytree worktree drain`,
        next: [
          'storytree worktree create --node <story> --intent "<what>" --pg',
          "storytree worktree prune",
          "storytree worktree drain",
          "storytree worktree --help",
        ],
      };
    }
    // Optional --pg consult: the CLAIM LEDGER is the authoritative "is a session live here" signal
    // (ADR-0200 D6 — presence retired); a live claim's sessionId IS the worktree basename
    // (ADR-0033), so any live claim (any grade) protects the worktree.
    let liveSessions = new Set<string>();
    const pruneLedger = deps.presence?.ledger ?? null;
    const pruneListLive = pruneLedger?.listLiveClaims;
    if (values.pg && pruneListLive !== undefined) {
      try {
        const claims = await pruneListLive.call(pruneLedger);
        liveSessions = new Set(claims.map((c) => c.sessionId));
      } catch {
        // Unreadable ledger — fall back to the offline mtime heuristic (still fully safe).
      }
    }
    const thresholdHours =
      values["threshold-hours"] !== undefined ? Number(values["threshold-hours"]) : NaN;
    const capRaw = values.cap !== undefined ? Number(values.cap) : NaN;
    const thresholdMs = Number.isFinite(thresholdHours)
      ? Math.max(0, thresholdHours) * 3_600_000
      : DEFAULT_THRESHOLD_MS;
    const wtIoShared: WorktreeIo | undefined = deps.worktree?.io;
    const wtDeps = {
      ...(wtIoShared !== undefined ? { io: wtIoShared } : {}),
      ...(deps.worktree?.now !== undefined ? { now: deps.worktree.now } : {}),
      ...(deps.worktree?.drain !== undefined ? { drain: deps.worktree.drain } : {}),
    };
    if (sub === "drain") {
      // worktree-reaper-integrity-arc strand 3 — read-only drain observability. Reads the ledger the
      // executing runs append to and goes RED on a measured stall, so "reaped nothing every run for a
      // week" can no longer hide behind the hook's silent-on-nothing-to-do contract.
      return worktreeDrainStatus(
        {
          thresholdMs,
          includeDetached: values["include-detached"] === true,
          liveSessions,
        },
        wtDeps,
      );
    }
    const options: PruneOptions = {
      force: values.force === true,
      yes: values.yes === true,
      hook: false,
      cap: Number.isFinite(capRaw) ? Math.max(0, Math.trunc(capRaw)) : null,
      includeDetached: values["include-detached"] === true,
      thresholdMs,
      liveSessions,
    };
    return pruneWorktrees(options, wtDeps);
  }

  if (area === "write-authority") {
    // ADR-0257 D1/D6, narrowed to the static block by ADR-0284 — install/inspect the wall. The deny
    // block is DERIVED from repo-manifest.json, so it needs a caller that can regenerate it;
    // installing by hand is how the wall and the repo surface drift apart. Offline, no store.
    return writeAuthorityCommand(sub, { write: values.write === true, help });
  }

  if (area === "tree") {
    if (help) return treeViewHelp();
    // `tree spec <node-id>` — the full spec markdown for one story/capability (the drive-shared
    // drill-down the orientation tools follow; same impl the desktop sidecar's runner serves).
    if (sub === "spec") return specView(deps.storiesDir ?? path.join(repoRoot(), "stories"), third);
    return treeCommand(sub, {
      storiesDir: deps.storiesDir ?? path.join(repoRoot(), "stories"),
      // Display-only buildable glyph, registry-based (ADR-0057 follow-up: make it spec-aware off the
      // already-loaded spec's `proof:` block so a self-registered node also glyphs as buildable; the
      // BUILD path is already spec-first via resolveBuildConfig — this is a cosmetic understatement).
      lookupConfig: lookupNodeBuildConfig,
      verdicts: deps.verdicts ?? null,
      attestations: deps.attestations ?? null,
      now: () => new Date(),
    });
  }

  if (area === "attest") {
    // `attest` is the back-compat alias for `witness vouch` (ADR-0118) — the SAME code path.
    if (help || sub === undefined) return attestHelp();
    const identity = sessionIdentity(deps);
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
    const isList = sub === "list";
    return attestCommand(
      {
        mode: isList ? "list" : "record",
        storyId: isList ? undefined : sub,
        testId: isList ? third : third,
      },
      makeAttestOpts(values),
      makeAttestDeps(deps, identity, storiesDir),
    );
  }

  if (area === "uat") {
    // ADR-0082 — the per-test UAT proof surface. `uat list`/`uat attest` are the back-compat aliases for
    // `witness list`/`witness attest` (ADR-0118) — the SAME code path, wired via makeUatDeps/makeUatOpts.
    if (help || sub === undefined) return uatHelp();
    const identity = sessionIdentity(deps);
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
    const uatDeps = makeUatDeps(deps, identity, storiesDir);
    const uatOpts = makeUatOpts(values);
    if (sub === "attest") {
      return uatCommand({ mode: "attest", storyId: third, target: fourth }, uatOpts, uatDeps);
    }
    if (sub === "list") return uatCommand({ mode: "list", target: third }, uatOpts, uatDeps);
    // bare: `storytree uat <story-id>` lists that story's tests.
    return uatCommand({ mode: "list", target: sub }, uatOpts, uatDeps);
  }

  if (area === "witness") {
    // ADR-0118 — the human/operator proof WORKFLOW. It cuts across adopt AND build (you witness a
    // story's UAT either way), so it is its OWN workflow. `witness list`/`witness attest` are the per-test
    // UAT proof (was `uat`); `witness vouch` is the lower-rigor ADR-0044 attestation (was `attest`). The
    // old verbs keep working as back-compat aliases — these route to the SAME uat/attest code paths.
    if (sub === undefined || help) return witnessHelp();
    const identity = sessionIdentity(deps);
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
    if (sub === "vouch") {
      // `witness vouch <test>` (record) / `witness vouch list <test>` (history) — was `attest` / `attest list`.
      const isList = third === "list";
      return attestCommand(
        {
          mode: isList ? "list" : "record",
          storyId: isList ? undefined : third,
          testId: fourth,
        },
        makeAttestOpts(values),
        makeAttestDeps(deps, identity, storiesDir),
      );
    }
    const uatDeps = makeUatDeps(deps, identity, storiesDir);
    const uatOpts = makeUatOpts(values);
    if (sub === "attest") {
      return uatCommand({ mode: "attest", storyId: third, target: fourth }, uatOpts, uatDeps);
    }
    if (sub === "list") return uatCommand({ mode: "list", target: third }, uatOpts, uatDeps);
    // bare `witness <story-id>` lists that story's UAT test criteria (mirrors bare `uat <story>`).
    return uatCommand({ mode: "list", target: sub }, uatOpts, uatDeps);
  }

  if (area === "gate") {
    // ADR-0085 (ADR-0083 Fork B) — the brownfield reliability-gates proof surface: `gate list <story>`
    // (read) + `gate run <story>#gate-<n>` (observe-and-sign an `observe` gate → an `adopted` verdict).
    // ADR-0098 (U2): `gate run <story>#gate-<n> --real` DRIVES a `build-tests` gate's red→green via the
    // referenced `(build:)` node and signs a DRIVEN verdict for the gate id (the gate→loop wiring).
    // The store/git/observe seams mirror `uat`; the observe runner spawns the gate's declared command.
    if (help || sub === undefined) return gateHelp();
    // ADR-0081: a --real gate build OWNS the DB and always persists — `--store memory` is no build
    // option (the internal "memory" seam is only ever injected into driveBuildTestsGate directly).
    if (values.store === "memory") return refuseMemoryStore("gate", third);
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
    // The gate seams + opts are shared with the new `build gate --real` entry (ADR-0118): `gate run`
    // stays as the back-compat alias for both the observe path (→ `adopt gate`, ADR-0118) and the
    // build-tests path (→ `build gate --real`), wired through the same makeGateDeps/makeGateOpts.
    const gateDeps = makeGateDeps(deps, values, storiesDir);
    const gateOpts = makeGateOpts(values);
    if (sub === "run") return gateCommand({ mode: "run", target: third }, gateOpts, gateDeps);
    if (sub === "list") return gateCommand({ mode: "list", target: third }, gateOpts, gateDeps);
    // bare: `storytree gate <story-id>` lists that story's gates.
    return gateCommand({ mode: "list", target: sub }, gateOpts, gateDeps);
  }

  if (area === "drift") {
    if (help) return driftHelp();
    return runDrift({
      ...(values.file !== undefined ? { file: values.file } : {}),
      ...(values.bound !== undefined ? { bound: values.bound } : {}),
      ...(values.change !== undefined ? { changes: values.change } : {}),
      ...(sub !== undefined ? { label: sub } : {}),
    });
  }

  if (area === "adr") {
    if (help) return adrHelp();
    const explicitDecided = values["decided-date"];
    if (explicitDecided !== undefined && !ISO_DATE.test(explicitDecided)) {
      return {
        ok: false,
        body: `--decided-date must be YYYY-MM-DD (got ${JSON.stringify(explicitDecided)}).`,
        next: ['storytree adr new --title "..." --decided --decided-date 2026-07-11 --pg'],
      };
    }
    return adrCommand(
      sub,
      {
        ...(values.title !== undefined ? { title: values.title } : {}),
        ...(values.arc !== undefined ? { arc: values.arc } : {}),
        ...(values.supersedes !== undefined ? { supersedes: values.supersedes } : {}),
        ...(values.amends !== undefined ? { amends: values.amends } : {}),
        ...(values.decided === true ? { decided: true } : {}),
        ...(values.current === true ? { current: true } : {}),
        ...(values["load-bearing"] === true ? { loadBearing: true } : {}),
        ...(values.status !== undefined ? { status: values.status } : {}),
      },
      {
        allocator: deps.adr ?? null,
        decisionsDir: deps.adrDecisionsDir ?? path.join(repoRoot(), "docs", "decisions"),
        // Branch is audit-only and only used on the live (--pg) path; skip the git spawn offline.
        branch: deps.adr ? currentBranch() : "offline",
        actor: deps.actor ?? defaultCliActor(),
        // The `decided:` date for an owner-directed scaffold (ADR-0110); composition-root clock.
        // OWNER-LOCAL, not UTC (see {@link ownerLocalDate}), and `--decided-date` overrides it for
        // an ADR whose decision was made earlier in the conversation or on a previous day.
        today: explicitDecided ?? ownerLocalDate(deps.now?.() ?? new Date()),
      },
    );
  }

  if (area === "arc") {
    // The derived initiative view (ADR-0183 D3): plans by `arcRef` query, ADRs/stories by their
    // frontmatter `arc:` stamps on disk — the upward view is never authored on the arc.
    if (help) return arcHelp();

    // `arc reconcile` needs BOTH halves of the deps — it READS every rollup (the view) and, under
    // --write, flips `lifecycle` on the ones that drifted (the write). It is dispatched ahead of the
    // write block because it takes no id and none of that block's prose flags.
    if (sub === "reconcile") {
      return arcReconcile(
        {
          store: deps.store,
          decisionsDir: deps.adrDecisionsDir ?? path.join(repoRoot(), "docs", "decisions"),
          storiesDir: deps.storiesDir ?? path.join(repoRoot(), "stories"),
          pg: values.pg === true,
          writable: deps.writable === true,
          ...(deps.actor !== undefined ? { actor: deps.actor } : {}),
          now: new Date().toISOString(),
        },
        {
          write: values.write === true,
          ...(values.only !== undefined ? { only: values.only } : {}),
        },
      );
    }

    // The WRITE verbs (arc new / arc edit / arc increment add / arc close) go through the validated
    // write path — a first-class replacement for the raw store one-shot (the ADR-0168 arc-edit
    // friction) and, for `new`, for hand-authoring the doc JSON (`no-arc-new-scaffolder-verb`). Long
    // prose (--intent/--end-state/--outcome/--description) accepts `@path` to read from a file so
    // shell quoting never mangles multi-line values into a literal `\n`.
    if (
      sub === "new" ||
      sub === "edit" ||
      sub === "increment" ||
      sub === "close" ||
      sub === "reopen" ||
      sub === "proposal"
    ) {
      const writeDeps: ArcWriteDeps = {
        store: deps.store,
        writable: deps.writable === true,
        ...(deps.actor !== undefined ? { actor: deps.actor } : {}),
        now: new Date().toISOString(),
        pg: values.pg === true,
      };
      // Every field here arrives ALREADY `@path`-expanded — the boundary at the top of `run` did it
      // once, for every prose flag, before any verb saw the value (cli-write-fidelity-arc). This is
      // now a plain rename from flag names to the write path's field names; `--change` is repeatable
      // and its (expanded) values join into paragraphs.
      const resolved: {
        intent?: string;
        endState?: string;
        outcome?: string;
        description?: string;
        objective?: string;
        body?: string;
        note?: string;
      } = {
        ...(values.intent !== undefined ? { intent: values.intent } : {}),
        ...(values["end-state"] !== undefined ? { endState: values["end-state"] } : {}),
        ...(values.outcome !== undefined ? { outcome: values.outcome } : {}),
        ...(values.description !== undefined ? { description: values.description } : {}),
        // The increment body (ADR-0305 D4) — two long-prose flags where the parked entry had seven.
        ...(values.objective !== undefined ? { objective: values.objective } : {}),
        ...(values.body !== undefined ? { body: values.body } : {}),
        ...(values.note !== undefined ? { note: values.note } : {}),
      };

      // `arc increment new|add|close` — the three increment verbs (ADR-0305 D1). `--id` is declared
      // `multiple` (it is `export-corpus`'s repeatable scope flag), so an entry slug is its first value.
      if (sub === "increment" || sub === "proposal") {
        const entryId = Array.isArray(values.id) ? values.id[0] : undefined;
        // `arc proposal add|realize` are the pre-fold spellings. They are REFUSED with the new verb
        // named rather than silently aliased: the shapes differ (an entry is a doc now, `realize`
        // has become the wider `close`), so an alias would take a `--summary` this schema no longer
        // has and fail on the field instead of on the rename.
        if (sub === "proposal") {
          const replacement =
            third === "realize"
              ? "storytree arc increment close <increment-id> --pr <ref> --pg"
              : 'storytree arc increment new <arc-id> --id <slug> --title "..." --objective <text|@file> --body <text|@file> --pg';
          return {
            ok: false,
            body: [
              `\`arc proposal ${third ?? ""}\` is gone — the arc's \`proposals[]\` array folded into the increment tier (ADR-0305 D1).`,
              "A parked entry is an `increment` doc with status `proposal`, so:",
              `  ${replacement}`,
              "and it is now readable and CORRECTABLE on its own: `storytree library artifact [edit] <increment-id> --pg`.",
            ].join("\n"),
            next: [replacement, "storytree arc --help"],
          };
        }
        if (third === "new") {
          return arcIncrementNew(writeDeps, fourth, {
            ...(entryId !== undefined ? { id: entryId } : {}),
            ...(values.title !== undefined ? { title: values.title } : {}),
            ...(resolved.objective !== undefined ? { objective: resolved.objective } : {}),
            ...(resolved.body !== undefined ? { body: resolved.body } : {}),
            ...(Array.isArray(values.friction) ? { friction: values.friction } : {}),
            ...(Array.isArray(values.cites) ? { cites: values.cites } : {}),
          });
        }
        if (third === "close") {
          return arcIncrementClose(writeDeps, fourth, {
            ...(values.pr !== undefined ? { pr: values.pr } : {}),
            ...(values.date !== undefined ? { date: values.date } : {}),
            ...(resolved.note !== undefined ? { note: resolved.note } : {}),
          });
        }
      }
      // The SCAFFOLDER (the missing first lifecycle step): the id is an optional positional, matching
      // every other arc verb — omitted, it is derived from --title.
      if (sub === "new") {
        return arcNew(writeDeps, third, {
          ...(values.title !== undefined ? { title: values.title } : {}),
          ...(resolved.intent !== undefined ? { intent: resolved.intent } : {}),
          ...(resolved.endState !== undefined ? { endState: resolved.endState } : {}),
          ...(resolved.description !== undefined ? { description: resolved.description } : {}),
          // The bundled first increment (ADR-0335) — the same two flags `arc increment new` reads,
          // already `@path`-expanded by the boundary above.
          ...(resolved.objective !== undefined ? { objective: resolved.objective } : {}),
          ...(resolved.body !== undefined ? { body: resolved.body } : {}),
        });
      }
      if (sub === "edit") {
        return arcEdit(writeDeps, third, {
          ...(resolved.intent !== undefined ? { intent: resolved.intent } : {}),
          ...(resolved.endState !== undefined ? { endState: resolved.endState } : {}),
        });
      }
      // The CLOSING write (ADR-0239 D2) shares every flag with `increment add`, and since the fold it
      // delegates to it: `close` is `increment add` followed by the `lifecycle: closed` flip.
      if (sub === "close") {
        return arcClose(writeDeps, third, {
          ...(values.date !== undefined ? { date: values.date } : {}),
          ...(values.pr !== undefined ? { pr: values.pr } : {}),
          ...(resolved.outcome !== undefined ? { outcome: resolved.outcome } : {}),
        });
      }
      // The OPENING write (ADR-0337) — `close`'s mirror, and the missing half of the lifecycle that
      // ADR-0239 D2 reserved for the owner without ever giving them a way to reach it. `--reason` is
      // already a PROSE_FLAG, so it arrives `@path`-expanded from the boundary above like every
      // other long-prose flag; there is no new flag to declare.
      if (sub === "reopen") {
        return arcReopen(writeDeps, third, {
          ...(values.date !== undefined ? { date: values.date } : {}),
          ...(values.pr !== undefined ? { pr: values.pr } : {}),
          ...(values.reason !== undefined ? { reason: values.reason } : {}),
        });
      }
      // `arc increment add <arc-id>` (canonical) or the shorthand `arc increment <arc-id>`.
      const incArcId = third === "add" ? fourth : third;
      return arcIncrementAdd(writeDeps, incArcId, {
        ...(values.date !== undefined ? { date: values.date } : {}),
        ...(values.pr !== undefined ? { pr: values.pr } : {}),
        ...(resolved.outcome !== undefined ? { outcome: resolved.outcome } : {}),
        ...(Array.isArray(values.id) && values.id[0] !== undefined ? { id: values.id[0] } : {}),
        ...(Array.isArray(values.cites) ? { cites: values.cites } : {}),
      });
    }

    // `arc show <id> --raw <field>` reads the SAME way `library artifact` does — the identical
    // function, not a second implementation, because the whole point of a raw read is that two
    // callers cannot disagree about what one stored field's bytes are. It also inherits that
    // function's miss behaviour: an unknown field exits non-zero naming the fields the doc has,
    // where this verb used to accept any string and answer with the full render.
    if (sub === "show" && values.raw !== undefined) {
      if (third === undefined) {
        return {
          ok: false,
          body: "`arc show --raw <field>` needs the arc id: `storytree arc show <arc-id> --raw <field>`.",
          next: ["storytree arc list --pg", "storytree arc show <arc-id> --raw intent --pg"],
        };
      }
      return rawField(deps.store, third, values.raw);
    }

    return arcCommand(
      sub,
      third,
      {
        store: deps.store,
        decisionsDir: deps.adrDecisionsDir ?? path.join(repoRoot(), "docs", "decisions"),
        storiesDir: deps.storiesDir ?? path.join(repoRoot(), "stories"),
        pg: values.pg === true,
      },
      // ADR-0239 D3 — the list is a worklist: active-only unless explicitly widened.
      arcScopeOf({ all: values.all === true, closed: values.closed === true }),
    );
  }

  if (area === "question") {
    // The open-question authoring surface (ADR-0314 D5): the verb an escalating session uses to put
    // a decision in front of the owner. WRITE-only by design — reading is `library artifact list
    // open-question --pg`, and answering is out of scope this round (ADR-0314 D9 keeps it read-only).
    // Every prose flag arrives already `@path`-expanded from the boundary at the top of `run`, which
    // is what lets a mermaid `--diagram` or a multi-paragraph `--context` survive the shell.
    if (help) return questionHelp();
    const writeDeps: QuestionWriteDeps = {
      store: deps.store,
      writable: deps.writable === true,
      ...(deps.actor !== undefined ? { actor: deps.actor } : {}),
      now: new Date().toISOString(),
      pg: values.pg === true,
    };
    return questionCommand(sub, third, writeDeps, {
      ...(values.arc !== undefined ? { arc: values.arc } : {}),
      ...(values.title !== undefined ? { title: values.title } : {}),
      ...(values.stakes !== undefined ? { stakes: values.stakes } : {}),
      ...(values.statement !== undefined ? { statement: values.statement } : {}),
      ...(values.context !== undefined ? { context: values.context } : {}),
      ...(values.options !== undefined ? { options: values.options } : {}),
      ...(values.diagram !== undefined ? { diagram: values.diagram } : {}),
      ...(values.recommendation !== undefined ? { recommendation: values.recommendation } : {}),
      ...(values.description !== undefined ? { description: values.description } : {}),
      ...(values["lease-days"] !== undefined ? { leaseDays: values["lease-days"] } : {}),
    });
  }

  if (area === "increment") {
    // The consumption-time freshness check (ADR-0183 D2): git-log the paths the plan names since
    // its anchor; drift past threshold → re-plan, not repair. The git seam is injectable for tests.
    if (help) return incrementHelp();
    const countCommits =
      deps.planCountCommits ??
      ((sha: string, p: string): number =>
        Number(
          execFileSync("git", ["rev-list", "--count", `${sha}..HEAD`, "--", p], {
            cwd: repoRoot(),
            encoding: "utf8",
          }).trim(),
        ));
    return incrementCommand(
      sub,
      third,
      { ...(values.threshold !== undefined ? { threshold: values.threshold } : {}) },
      { store: deps.store, countCommits, pg: values.pg === true },
    );
  }

  if (area === "traversal") {
    // The captured-trace surface (ADR-0235 / ADR-0241). Local JSONL only — offline-safe, never
    // `--pg`: `list`/`show` read it, and `ingest` (ADR-0248 D1) reads this session's host
    // transcripts and appends their occupancy to the same local trace. The compositions live in
    // `@storytree/context-traversal-capture`, `-spawn`, and `-transcript`; this branch is declared
    // glue (ADR-0158) and is claimed by no capability.
    if (help) return traversalHelp();
    return traversalCommand(sub, third);
  }

  if (area === "agents") {
    if (help) return agentsHelp();
    // `--step <step>` serves ONE workflow step's just-in-time refs as an envelope (ADR-0156 §4 /
    // ADR-0161); bare `agents <name>` still prints the full assembled prompt.
    if (values.step !== undefined) return agentStepCommand(deps.store, sub, values.step);
    return agentsCommand(deps.store, sub);
  }

  if (area === "orchestrate") {
    // ADR-0108 Phase 1 — the headless orchestrator runtime, driven by a programmatic intent. Loads the
    // generated session-orchestrator agent (ADR-0051), wires the READ-ONLY orientation tools, and runs
    // one live SDK session that ORIENTS on the real three surfaces and PROPOSES a unit. Read/propose
    // ONLY: it holds no signing key and writes/builds/signs/lands NOTHING (Phases 3–5).
    if (help) return orchestrateHelp();
    const intent = positionals.slice(1).join(" ").trim();
    if (intent === "") {
      return {
        ok: false,
        body: 'orchestrate needs an intent: storytree orchestrate "<what to orient and propose for>"',
        next: ['storytree orchestrate "orient and propose the next unit"', "storytree agents session-orchestrator"],
      };
    }
    // The orientation runner is the SAME run() dispatch closed over the session deps with
    // writable:false — the session's tools read tree/library/noticeboard and can never write. The
    // queryFn comes from the test seam when present (offline proof, no spend), else is omitted so
    // runHeadlessOrchestrator uses the real SDK query() (the live leg; subscription-billed).
    const result = await orchestrate({
      intent,
      store: deps.store,
      runner: (toolArgv) => run([...toolArgv], { ...deps, writable: false }),
      ...(deps.orchestrate?.queryFn !== undefined ? { queryFn: deps.orchestrate.queryFn } : {}),
      ...(values.model !== undefined ? { model: values.model } : {}),
      ...(values["max-turns"] !== undefined ? { maxTurns: Number(values["max-turns"]) } : {}),
      ...(values.budget !== undefined ? { maxBudgetUsd: Number(values.budget) } : {}),
    });
    if (!result.ok) {
      return {
        ok: false,
        body: `orchestration failed: ${result.error ?? "(no detail)"}`,
        next: ["storytree agents session-orchestrator   (the loop definition the runtime runs)"],
      };
    }
    return {
      ok: true,
      body: [
        "# Orientation / proposal — ADR-0108 Phase 1 (read/propose only; nothing built, signed, or landed)",
        "",
        result.proposal ?? "(no proposal text returned)",
        "",
        `— ${result.turns ?? "?"} turns, $${(result.costUsd ?? 0).toFixed(4)} SDK-reported (subscription-billed)`,
      ].join("\n"),
      next: ["storytree tree", "storytree library"],
    };
  }

  if (area === "adopt") {
    // ADR-0097 / ADR-0106 — the brownfield ADOPTION surface. `adopt <story> --pg` RUNS the adoption
    // (observe-and-sign the `observe` reliability gates + machine UAT legs → `adopted` verdicts, then
    // flip `mapped → proposed`) — the SAME engine the studio's Adopt button drives (adoptStory). `adopt
    // plan <story>` is the offline adoption-plan classification (ADR-0097 Layer 2). The store / git /
    // observe / signer / status-flip seams mirror `gate` (the verdict store is the same PgWorkStore under
    // --pg). ADR-0118: the OBSERVE gate primitive now nests here as `adopt gate <story>#gate-<n>`
    // (observe-and-sign one observe gate — an observe gate IS earned by adoption); the `build-tests`
    // gate, earned by a real red→green BUILD (ADR-0098), lives under `build gate --real` (Unit A), not
    // here. This un-conflates the old `gate run` phase fork at the surface (ADR-0118): observe → adopt,
    // build-tests → build. The honesty walls (only a brownfield story, an observe gate, a resolved
    // approver, the live store, a clean HEAD) live in drive's runAdopt / the gate compute; CLI wires seams.
    if (help || sub === undefined) return adoptHelp();
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
    const adoptDeps: AdoptDispatchDeps = {
      store: deps.uatStore ?? null,
      loadStory: (sid) => loadAdoptStory(storiesDir, sid),
      gitState: readGitState,
      observe: observeCommand,
      resolveApprover: (flag?: string) => resolveSignerFromEnv(flag !== undefined ? { flag } : undefined),
      flipStatusToProposed: (sid) => flipStatusToProposedFile(storiesDir, sid),
      loadPlanStory: (sid) => loadAdoptPlanStory(storiesDir, sid),
      now: () => new Date(),
    };
    // The approver flag is --signer (preferred) or --actor (the studio worker's name for it, ADR-0097);
    // either feeds the fail-closed chain (flag → STORYTREE_SIGNER → git email) inside runAdopt.
    const approverFlag = values.signer ?? values.actor;
    const adoptOpts = approverFlag !== undefined ? { signer: approverFlag } : {};
    if (sub === "plan") {
      // `--readings <file>` (ADR-0098 d.1): the agent's per-pocket analysis lifts the plan from the
      // mechanical covers-diff to the FULL proposal. The file IO is fail-closed here; the parsed map then
      // flows through the offline-testable dispatcher → adoptPlanCommand.
      let readings: Readonly<Record<string, PocketReading>> | undefined;
      if (values.readings !== undefined) {
        try {
          readings = parsePocketReadings(JSON.parse(readFileSync(values.readings, "utf8")));
        } catch (err) {
          return {
            ok: false,
            body: `--readings: could not read/parse "${values.readings}" as a pocket-readings JSON map — ${err instanceof Error ? err.message : String(err)}`,
            next: ["storytree adopt plan <story-id>"],
          };
        }
      }
      return adoptCommand(
        { mode: "plan", target: third, ...(readings !== undefined ? { readings } : {}) },
        adoptOpts,
        adoptDeps,
      );
    }
    // `adopt gate <story>#gate-<n>` — observe-and-sign ONE observe gate (ADR-0118; was `gate run <g>`,
    // kept as a back-compat alias). The SAME gate code path as `gate run`; the gate's kind routes it (a
    // build-tests gate is NOT adoption — the gate compute refuses it here, pointing at `build gate --real`).
    if (sub === "gate") {
      if (values.store === "memory") return refuseMemoryStore("gate", third);
      return gateCommand(
        { mode: "run", target: third },
        makeGateOpts(values),
        makeGateDeps(deps, values, storiesDir),
      );
    }
    // bare: `storytree adopt <story-id>` RUNS the adoption.
    return adoptCommand({ mode: "run", target: sub }, adoptOpts, adoptDeps);
  }

  if (area === "coverage") {
    // ADR-0020 coverage-honesty follow-on — does every declared contract have an observed test? The
    // unit loader is the pure-by-injection seam (reads the spec's `## Contracts` + the proof surface's
    // test names off disk); the classifier is `@storytree/orchestrator`'s. Offline, read-only.
    if (help) return coverageHelp();
    const storiesDir = deps.storiesDir ?? path.join(repoRoot(), "stories");
    const root = repoRoot();
    return coverageCommand(sub, {
      loadUnit: (unitId) => loadCoverageUnit(storiesDir, root, unitId),
    });
  }

  if (area === "ownership") {
    // ADR-0317 D2 — the SECOND declared ownership map, at subtree grain, held to the disk by a
    // totality walk. REPORT-ONLY: it names every source file falling under no declared subtree and
    // fails nothing. It reads `repo-manifest.json` `sourceOwnership`, never `proof.real.sourceFile`
    // (a unit→file build target) or `scope.sourceGlobs` (a write fence) — neither is ownership, and
    // both stay untouched so the prove-it-gate carries no risk. Offline, read-only.
    if (help) return ownershipHelp();
    const root = repoRoot();
    return ownershipCommand(
      { gather: () => gatherFromDisk(root) },
      { all: values.all === true, ...(sub !== undefined ? { pkg: sub } : {}) },
    );
  }

  if (area === "desktop") {
    // The Electron desktop client's CLI launcher (ADR-0109/0111): a thin wrapper around the
    // existing per-app launcher (`pnpm --filter desktop start`, surface-coverage-gate's
    // PER_APP_ENTRYPOINTS) — spawns it DETACHED so the invoking session isn't blocked on the
    // long-running GUI process.
    if (help || sub === undefined) return desktopHelp();
    if (sub === "install-shortcut") {
      // A reproducible Windows .lnk (Desktop + Start Menu) that opens the app with no console window
      // and the storytree icon — the durable replacement for the vanished hand-made shortcut.
      return desktopInstallShortcut({
        repoRoot: deps.desktop?.repoRoot ?? repoRoot(),
        ...(deps.desktop?.platform !== undefined ? { platform: deps.desktop.platform } : {}),
        ...(deps.desktop?.createShortcuts !== undefined ? { createShortcuts: deps.desktop.createShortcuts } : {}),
        ...(deps.desktop?.resolveElectron !== undefined ? { resolveElectron: deps.desktop.resolveElectron } : {}),
        ...(values.runtime !== undefined ? { runtime: values.runtime } : {}),
      });
    }
    if (sub !== "launch") {
      return {
        ok: false,
        body: `unknown desktop command "${sub}". try: storytree desktop launch | storytree desktop install-shortcut`,
        next: ["storytree desktop launch", "storytree desktop install-shortcut", "storytree desktop --help"],
      };
    }
    return desktopLaunch({
      repoRoot: deps.desktop?.repoRoot ?? repoRoot(),
      ...(deps.desktop?.spawn !== undefined ? { spawn: deps.desktop.spawn } : {}),
      ...(deps.desktop?.platform !== undefined ? { platform: deps.desktop.platform } : {}),
    });
  }

  if (area === "friction") {
    // The friction capture surface (ADR-0168 inc 2). `new` falls back to a docs/friction-inbox/
    // staging file offline (D2); `migrate` files the staged items live (transport — provenance
    // preserved, no cap-3, migrate-only); `reinforce`/`route` are live-store writes; `list` is a
    // read (offline OK, seed-backed). The capture context (branch/clock/dirs) is `deps.friction`.
    if (sub === undefined || help) return frictionHelp();
    const ctx = makeFrictionContext(deps);
    if (sub === "new") {
      return newFriction(deps, {
        ...(values.json !== undefined ? { json: values.json } : {}),
        ...(values.file !== undefined ? { file: values.file } : {}),
        ...(values.source !== undefined ? { source: values.source } : {}),
      }, ctx);
    }
    if (sub === "migrate") {
      return migrateFriction(deps, {
        ...(values.file !== undefined ? { file: values.file } : {}),
      }, ctx);
    }
    // `--evidence` / `--reason` arrive already `@path`-expanded from the boundary at the top of
    // `run` (cli-write-fidelity-arc). Without that expansion a multi-line justification flattens to
    // a literal `\n` through the pnpm forwarder, and a `->` inside the string escapes shell quoting
    // badly enough to truncate the value and drop a stray redirect file into the worktree — the
    // `friction-capture-surface-is-itself-high-friction` item, defect 3.
    if (sub === "reinforce" || sub === "route") {
      const evidence = values.evidence;
      const reason = values.reason;
      if (sub === "reinforce") {
        return reinforceFriction(deps, third, {
          ...(evidence !== undefined ? { evidence } : {}),
        }, ctx);
      }
      return routeFriction(deps, third, {
        ...(values.route !== undefined ? { route: values.route } : {}),
        ...(reason !== undefined ? { reason } : {}),
        ...(values["discharged-by"] !== undefined ? { dischargedBy: values["discharged-by"] } : {}),
        // The deliberate foreign overwrite — see `routeFriction`'s compare-and-refuse guard.
        ...(values["re-route"] === true ? { reRoute: true } : {}),
        // The ADR-0298 D2 emission: the ARC carrying the parked entry the `tool` route produces,
        // cited in `references`. The entry itself is written first by `arc proposal add --friction`.
        ...(values.arc !== undefined ? { arc: values.arc } : {}),
      }, ctx);
    }
    if (sub === "list") {
      return listFriction(deps.store, { now: ctx.now, inboxDir: ctx.inboxDir });
    }
    return {
      ok: false,
      body: `unknown friction command "${sub}". try: new | migrate | reinforce | route | list`,
      next: ["storytree friction --help", "storytree friction list"],
    };
  }

  if (area === "factory") {
    // The report-only factory-floor health instrument (ADR-0316). Reads the live Library + the git
    // history; writes nothing, gates nothing, and adjudicates nothing (D1/D4).
    if (sub === undefined && help) return factoryHelp();
    if (sub !== undefined && sub !== "health") {
      return {
        ok: false,
        body: `unknown factory command "${sub}". try: storytree factory health [recurrence|bottlenecks|churn]`,
        next: ["storytree factory health", "storytree factory --help"],
      };
    }
    if (help) return factoryHelp();
    return factoryHealth(deps.store, {
      ...(third !== undefined ? { question: third } : {}),
      ...(values.from !== undefined ? { from: values.from } : {}),
      ...(values.to !== undefined ? { to: values.to } : {}),
      ...(values["landings-per-day"] !== undefined ? { landingsPerDay: values["landings-per-day"] } : {}),
      ...(values.ref !== undefined ? { ref: values.ref } : {}),
      repoRoot: deps.factory?.repoRoot ?? repoRoot(),
      ...(deps.factory?.commits !== undefined ? { commits: deps.factory.commits } : {}),
      ...(deps.factory?.absorbed !== undefined ? { absorbed: deps.factory.absorbed } : {}),
      now: deps.factory?.now ?? new Date().toISOString(),
    });
  }

  if (area === "onboarding") {
    // The post-session onboarding-budget monitor (ADR-0162 Phase 2). Fully offline: it reads a host
    // transcript file, never the store — no --pg, nothing on any session's hot path. It FLAGS a
    // budget breach, never halts (ADR-0162 §Why-not-a-gate).
    if (help && sub === undefined) return onboardingHelp();
    return onboardingCommand(positionals.slice(1), {
      ...(values["agent-type"] !== undefined ? { agentType: values["agent-type"] } : {}),
    });
  }

  if (area === "session-cost") {
    // The repeatable session-cost measurement (ADR-0323 D4, `session-cost-arc`). Fully offline: it
    // reads host transcripts under `~/.claude/projects`, never the store — no --pg, no credential.
    // Report-only and deliberately NOT a gate rung (ADR-0323 Unresolved + ADR-0168 D1): a cost gate
    // would be gamed by splitting sessions.
    if (help) return sessionCostHelp();
    return sessionCostCommand({
      ...(values["limit"] !== undefined ? { limit: values["limit"] } : {}),
      ...(values["from"] !== undefined ? { from: values["from"] } : {}),
      ...(values["to"] !== undefined ? { to: values["to"] } : {}),
      ...(values["project"] !== undefined ? { project: values["project"] } : {}),
      ...(values["min-turns"] !== undefined ? { minTurns: values["min-turns"] } : {}),
      ...(values["started-after"] !== undefined ? { startedAfter: values["started-after"] } : {}),
      ...(values["started-before"] !== undefined ? { startedBefore: values["started-before"] } : {}),
      all: values["all"] === true,
      cwd: process.cwd(),
      nowMs: Date.now(),
    });
  }

  if (area === "doctor") {
    // The explorer-onboarding setup check (ADR-0207 D6). Read-only, offline-capable: it probes the
    // setup invariants of THIS checkout and prints a fix hint per failure — no store, no --pg, and it
    // never handles a Claude credential (detects a logged-in CLI by file existence only, D3).
    if (help) return doctorHelp();
    return doctorCommand(positionals.slice(1));
  }

  if (area === "dispatch") {
    // The caller's half of the ADR-0328 D3 handback: read a backgrounded job's handle ONCE and be
    // told the truth, including when the truth is "not yet". Offline, read-only, no store — a
    // handle must stay readable by whoever inherits it, long after the dispatching agent is gone.
    if (help) return dispatchHelp();
    return dispatchCommand(positionals.slice(1));
  }

  if (area === "guide") {
    // The guided repair loop over doctor (ADR-0207 D6): run the check, explain it plainly, and — only
    // under `--fix` — repair each failure by re-running its idempotent `install.ps1` step, re-checking
    // after each. The Claude sign-in is INSTRUCTED and never performed (D3): the guide stops and tells
    // the dev what to do. Bare `storytree guide` previews and enacts nothing.
    if (help) return guideHelp();
    return guideCommand(positionals.slice(1), { fix: values["fix"] === true });
  }

  if (area !== "library") {
    return {
      ok: false,
      body: `unknown area "${area}". areas: ${CLI_AREAS.join(", ")}.`,
      next: ["storytree library", "storytree agents <name>"],
    };
  }

  if (sub === undefined) {
    if (help) return libraryHelp(deps.store);
    if (values.check === true) return libraryCheck(deps.store);
    return dashboard(deps.store);
  }

  if (sub === "graduate") {
    // Default the memory dir to the harness store keyed by the MAIN checkout (works from a worktree);
    // --memory-dir overrides. The dedupe snapshot is the LIVE corpus since ADR-0302 D1 (it was the
    // committed seed; a stale one under-dedupes and re-offers already-graduated memories).
    // `defaultMemoryDir`/`readLiveSnapshot`/`defaultLedgerPath` are shared with the
    // `check:graduation-worklist` gate nudge so the two never drift on where memory / the corpus /
    // the park ledger live (@storytree/cli graduate.ts).
    const memoryDir = values["memory-dir"] ?? defaultMemoryDir(os.homedir());
    const now = new Date().toISOString().slice(0, 10);

    if (third === "park") {
      // ADR-0202: record a librarian park verdict (wont-graduate + reason + hash + lease). A
      // machine-local ledger write, deliberately NOT --pg-gated (agent memory is per-machine).
      if (help) return graduateHelp();
      let items: ParkItem[];
      if (values.file !== undefined) {
        try {
          items = parseParkFile(readFileSync(values.file, "utf8"));
        } catch (e) {
          return {
            ok: false,
            body: `could not read the park batch file ${values.file}: ${(e as Error).message}\n\nExpected a JSON array of { "name": "<memory>", "reason": "<why it stays>", "leaseDays"?: <days> }.`,
            next: ["storytree library graduate   (the current worklist)"],
          };
        }
      } else {
        if (fourth === undefined || values.reason === undefined) {
          return {
            ok: false,
            body: [
              "graduate park needs a memory name AND a reason (the recorded verdict is the point, ADR-0202):",
              "",
              '  storytree library graduate park <name> --reason "<why it stays in memory>" [--lease-days <n>]',
              "  storytree library graduate park --file <parks.json>   (batch: [{ name, reason, leaseDays? }])",
            ].join("\n"),
            next: ["storytree library graduate   (the current worklist)"],
          };
        }
        let leaseDays: number | undefined;
        if (values["lease-days"] !== undefined) {
          leaseDays = Number.parseInt(values["lease-days"], 10);
          if (!Number.isInteger(leaseDays) || leaseDays <= 0) {
            return {
              ok: false,
              body: `--lease-days must be a positive integer (got ${JSON.stringify(values["lease-days"])})`,
              next: ["storytree library graduate park <name> --reason <why> --lease-days 60"],
            };
          }
        }
        items = [
          {
            name: fourth,
            reason: values.reason,
            ...(leaseDays !== undefined ? { leaseDays } : {}),
          },
        ];
      }
      return parkCommand(items, { memoryDir, ledgerPath: defaultLedgerPath(memoryDir), now });
    }

    if (help) return graduateHelp();
    let snapshot;
    try {
      snapshot = await readLiveSnapshot();
    } catch (e) {
      return {
        ok: false,
        body: `Could not read the live Library corpus to dedupe against:\n\n${(e as Error).message}`,
        next: ["pnpm db:up   (then re-run)", "pnpm db:probe   (confirm reachability)"],
      };
    }
    return graduateCommand(
      { review: values.review === true },
      {
        memoryDir,
        snapshot,
        ledgerPath: defaultLedgerPath(memoryDir),
        now,
      },
    );
  }

  if (sub === "tree") {
    if (third === undefined || help) return treeHelp();
    if (third !== "focus") {
      return {
        ok: false,
        body: `unknown tree command "${third}". try: storytree library tree focus <id>`,
        next: ["storytree library"],
      };
    }
    return treeFocus(deps.store, fourth);
  }

  if (sub === "artifact") {
    if (third === undefined || help) return artifactHelp();
    if (third === "list") return listCategory(deps.store, fourth);
    if (third === "new") return newArtifact(deps, { json: values.json, file: values.file });
    if (third === "edit") {
      return editArtifact(deps, fourth, {
        sets: values.set ?? [],
        json: values.json,
        file: values.file,
      });
    }
    if (third === "retire") {
      return retireArtifact(deps, fourth, {
        reason: values.reason,
        supersededBy: values["superseded-by"],
      });
    }
    if (third === "comment") {
      return {
        ok: false,
        body: "artifact comment is coming soon (it writes to the separate comment store).",
        next: ["storytree library artifact <id>"],
      };
    }
    // The bare-bytes read: ONE field's exact stored value on stdout, so a partial edit to a long
    // field can round-trip the untouched parts through `--set <field>=@path`.
    if (values.raw !== undefined) return rawField(deps.store, third, values.raw);
    return viewArtifact(deps.store, third, deps.offerId);
  }

  return {
    ok: false,
    body: `unknown library command "${sub}".`,
    next: ["storytree library", "storytree library artifact list <category>"],
  };
}
