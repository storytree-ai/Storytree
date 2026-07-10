// `adoptStory` — the ADOPT entry (ADR-0097): bringing a brownfield (`mapped`) story INTO the fold is
// a proving process entered by a deliberate human adoption decision. This is the cheap first step:
// the spine observe-and-signs the story's author-declared `observe` reliability gates (ADR-0085) to
// `adopted` verdicts — machine-witnessed (signed by the spine principal), human-approved (`approvedBy`
// = the operator who decided) — and flips the story `mapped → proposed` ("adoption underway").
//
// It GREENS NOTHING on its own: adopting the observe gates greens the capabilities they `(covers:)`,
// but any capability covered by no honest gate (a `build-tests` pocket) holds the crown at `proposed`
// until that real red→green work is done. The crown stays non-authorable (ADR-0020) — `adoptStory`
// signs verdicts, it never writes `status: healthy`.
//
// The studio's UI-driven Adopt button drives THIS entry (the server-process worker calls it, the same
// way the build worker calls `nodeBuild`/`storyBuild`) — re-exported from `@storytree/drive/build`
// (and from `@storytree/cli/build` for back-compat). The frontend imports none of it (ADR-0004).
//
// Two layers, like the build entries: a PURE-by-injection {@link runAdopt} core (every seam injected,
// offline-testable with no DB / git / subprocess) and a self-wiring {@link adoptStory} that resolves
// the live pg verdict store, the git state, the observe runner, the signer chain, and the status-flip
// writer, then calls the core.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ReliabilityGate, UatTest } from "@storytree/library";
import { resolveWitness } from "@storytree/library";
import {
  findNodeSpecFile,
  loadNodeSpec,
  observeAndSign,
  platformShellCommand,
  resolveSignerFromEnv,
  runShellCommand,
  SPINE_PRINCIPAL,
  type AdoptedVerdictStore,
  type SignerResult,
} from "@storytree/orchestrator";

import { ensureLiveDb } from "./db-control.js";
import type { Envelope } from "./envelope.js";
import { repoRoot, rel, resolveVerdictStore } from "./node-build.js";

// ---------------------------------------------------------------------------
// Pure status flip (mapped → proposed)
// ---------------------------------------------------------------------------

/** The outcome of flipping a story's authored `status:` frontmatter line. */
export type FlipResult =
  | { ok: true; changed: boolean; content: string }
  | { ok: false; reason: string };

/**
 * PURE: flip a story.md's frontmatter `status: <from>` line to `status: <to>`, returning the new file
 * content. Idempotent: if it is already `<to>` it returns `changed: false` (no error — re-adopting an
 * already-`proposed` story is fine). Fail-closed: a missing frontmatter block, a missing `status:`
 * line, or a status that is neither `<from>` nor `<to>` REFUSES (never flips e.g. a `healthy` status).
 * Only the `status:` line is touched — the rest of the file is byte-preserved.
 */
export function flipFrontmatterStatus(raw: string, from: string, to: string): FlipResult {
  if (!raw.startsWith("---\n")) return { ok: false, reason: "no frontmatter block (missing leading '---')" };
  const end = raw.indexOf("\n---", 4);
  if (end < 0) return { ok: false, reason: "unterminated frontmatter block (no closing '---')" };
  const block = raw.slice(0, end);
  const m = /^status:[ \t]*["']?([A-Za-z-]+)["']?[ \t]*$/m.exec(block);
  if (m === null) return { ok: false, reason: "no `status:` line in the frontmatter" };
  const current = m[1]!;
  if (current === to) return { ok: true, changed: false, content: raw };
  if (current !== from) {
    return { ok: false, reason: `status is "${current}", not "${from}" — refusing to flip (ADR-0097 enters proposed only from mapped)` };
  }
  const newLine = m[0].replace(current, to); // the value appears once in the matched line
  const newBlock = block.slice(0, m.index) + newLine + block.slice(m.index + m[0].length);
  return { ok: true, changed: true, content: newBlock + raw.slice(end) };
}

// ---------------------------------------------------------------------------
// Pure-by-injection core
// ---------------------------------------------------------------------------

/** A story's adoptable facts: its authored status, declared reliability gates, and UAT legs. */
export interface AdoptStory {
  status: string;
  reliabilityGates: ReliabilityGate[];
  /**
   * The story's per-test UAT legs (ADR-0044). ADR-0106: the adopt pass classifies each via
   * {@link resolveWitness} — observe-and-signs the `machine` legs an existing suite covers, records
   * the uncovered `machine` legs as `build-tests` obligations for Build, and leaves `human` legs for
   * the operator's "I saw it work" attestation. Aspirational `wouldBe` legs (ADR-0097) are skipped.
   */
  uatTests: UatTest[];
}

/** Every seam {@link runAdopt} touches, injected for determinism (offline-testable). */
export interface AdoptDeps {
  /** The live verdict store the signed `adopted` rows append to; null offline (then adopt refuses). */
  store: AdoptedVerdictStore | null;
  /** The story's authored status + declared reliability gates; null for a missing/odd spec. */
  loadStory: (storyId: string) => AdoptStory | null;
  /** The session repo's HEAD + clean-tree state; null when git can't answer (adopt then refuses). */
  gitState: () => { commitSha: string; clean: boolean } | null;
  /** The spine's out-of-band observation of a declared command (exit code as data). */
  observe: (command: string) => Promise<{ code: number | null }>;
  /** Resolve the human APPROVER (who is adopting); fail-closed (ADR-0097 d.4 — always a human act). */
  resolveApprover: (flag?: string) => SignerResult;
  /** Flip the story's authored status mapped→proposed (the adoption decision); side-effecting writer. */
  flipStatusToProposed: (storyId: string) => FlipResult;
  now: () => Date;
}

export interface AdoptOpts {
  /** `--signer`/`--actor` — the approver chain's flag tier (flag → STORYTREE_SIGNER → git email). */
  signer?: string;
}

/**
 * PURE-by-injection: adopt a brownfield story (ADR-0097). Observe-and-signs each `observe` gate to an
 * `adopted` verdict, then flips `mapped → proposed`. Fail-closed BEFORE any signing: a non-brownfield
 * status, no observe gates, no resolved approver, no live store, an unreadable or DIRTY tree all refuse
 * (an adopted verdict pins the clean commit it observed). The signings happen FIRST (the tree is clean
 * throughout — nothing is edited until after), THEN the status flip dirties the tree with just that one
 * line for the operator to commit.
 */
export async function runAdopt(
  storyId: string | undefined,
  opts: AdoptOpts,
  deps: AdoptDeps,
): Promise<Envelope> {
  if (storyId === undefined || storyId.trim().length === 0) {
    return { ok: false, body: "adopt needs a story id: storytree adopt <story-id> --pg", next: ["storytree tree"] };
  }
  const id = storyId.trim();
  const story = deps.loadStory(id);
  if (story === null) {
    return { ok: false, body: `no story "${id}" (looked for stories/${id}/story.md, or its spec did not load).`, next: ["storytree tree"] };
  }
  // Only a brownfield story is adopted. `proposed` is allowed (re-running an in-progress adoption);
  // `healthy`/`unhealthy`/etc. are not — adoption is the `mapped → proposed` entry (ADR-0097).
  if (story.status !== "mapped" && story.status !== "proposed") {
    return {
      ok: false,
      body: `story "${id}" is "${story.status}", not a brownfield (mapped) story to adopt (ADR-0097 — Adopt is the mapped→proposed entry).`,
      next: [`storytree tree ${id}`],
    };
  }
  const observeGates = story.reliabilityGates.filter((g) => g.kind === "observe");
  if (observeGates.length === 0) {
    const gateCount = story.reliabilityGates.length;
    return {
      ok: false,
      body:
        gateCount === 0
          ? `story "${id}" declares no \`## Reliability Gates\` to adopt (ADR-0085 — author them so it can be Adopted).`
          : `story "${id}" declares no \`observe\` reliability gates — its ${gateCount} gate(s) are earned by real work (a build-tests red→green / a capability), not observe-and-sign.`,
      next: [`storytree gate list ${id} --pg`],
    };
  }
  // The adoption decision is always a human act (ADR-0097 d.4): resolve the approver before any spend.
  const approver = deps.resolveApprover(opts.signer);
  if (!approver.ok) {
    return {
      ok: false,
      body: `${approver.error}\nName who is adopting it: --signer <email> (or set git user.email / STORYTREE_SIGNER).`,
      next: [`storytree adopt ${id} --signer <email> --pg`],
    };
  }
  // A signed `adopted` verdict must persist (a verdict that evaporates greens nothing).
  if (deps.store === null) {
    return {
      ok: false,
      body: "adopt signs `adopted` verdicts to the live store (events.verdict) — run with the DB up (pnpm db:up).",
      next: ["pnpm db:up", `storytree adopt ${id} --pg`],
    };
  }
  // The verdict pins a commit, so the tree must be readable AND clean (the gate's honesty wall).
  const git = deps.gitState();
  if (git === null) {
    return { ok: false, body: "adopt could not read git state (HEAD / clean tree) — a verdict must pin a real commit. Run inside the repo.", next: [] };
  }
  if (!git.clean) {
    return {
      ok: false,
      body: `adopt from a clean committed HEAD — the tree at ${git.commitSha.slice(0, 7)} has uncommitted edits, and an adopted verdict pins the commit it observed.`,
      next: ["git status", `storytree adopt ${id} --pg`],
    };
  }

  // Observe-and-sign each obligation (the tree stays clean — we edit nothing until after). One CLEAN
  // observation per DISTINCT command (memoized): the observe gate's suite is shared by the machine UAT
  // legs it covers, so it runs ONCE, not once per obligation.
  const store = deps.store;
  const runId = `studio-adopt:${deps.now().toISOString()}`;
  const observe = memoizeObserve(deps.observe);
  const gitState = async (): Promise<{ commitSha: string; clean: boolean }> => ({
    commitSha: git.commitSha,
    clean: git.clean,
  });
  const now = (): string => deps.now().toISOString();
  const approverInputs = { flag: approver.signer };

  const gateLines: string[] = [];
  let signedGates = 0;
  for (const gate of observeGates) {
    const res = await observeAndSign({ gate, gitState, observe, approverInputs, store, runId, now });
    if (res.ok) {
      signedGates += 1;
      gateLines.push(`  ✓ ${gate.id} adopted — \`${gate.proofCommand}\` observed green${gate.covers.length > 0 ? ` (covers: ${gate.covers.join(", ")})` : ""}`);
    } else {
      gateLines.push(`  ✗ ${gate.id} — ${res.reason}`);
    }
  }

  // ADR-0106 / uat-bound-command-adoption: classify each UAT leg's witness and, for a real
  // (non-`wouldBe`) `machine` leg, resolve its EXACT covering observe-gate command through the
  // library's pure classifier (`resolveWitness`) — consuming the command from that resolution
  // directly, never independently re-deriving it and never falling back to the first observe gate
  // found. A leg's own declared `(proof-gate: story-id#gate-n)` binding always wins; a story where
  // NO real machine leg has yet declared one keeps the pre-binding convenience (the story's single
  // declared observe gate covers every undeclared machine leg) — but the instant ANY leg opts into an
  // explicit binding, that convenience retires for the WHOLE story: every other machine leg must then
  // bind explicitly too. A `human` (or undecided `either`) leg is left for the operator's "I saw it
  // work" attestation (ADR-0082); aspirational `wouldBe` legs (ADR-0097) are not obligations, so they
  // are skipped (mirroring the crown roll-up's `!wouldBe` filter).
  //
  // ALL real machine legs are resolved BEFORE any is signed: an invalid or unbound machine leg fails
  // the WHOLE UAT-signing pass — no fallback to another gate, and no partial UAT verdict set, even for
  // a sibling leg that would otherwise resolve fine on its own. Reliability-gate signing (above) and
  // the mapped→proposed adoption decision (below) stay separate behaviours, unaffected by this.
  const reliabilityGates = story.reliabilityGates;
  const realLegs = story.uatTests.filter((t) => !t.wouldBe);
  const realMachineLegs = realLegs.filter((t) => t.witness === "machine");
  const anyExplicitBinding = realMachineLegs.some((t) => t.proofGateId !== undefined);
  const soleObserveGate = observeGates.length === 1 ? observeGates[0] : undefined;

  type LegOutcome =
    | { kind: "human" }
    | { kind: "observe"; observedBy: string; proofCommand: string }
    | { kind: "refused"; reason: string };

  function resolveLeg(t: UatTest, gates: ReliabilityGate[]): LegOutcome {
    if (t.witness !== "machine") return { kind: "human" };
    // A leg's own binding always wins; absent one, the sole-observe-gate convenience applies ONLY
    // while no OTHER machine leg in the story has opted into an explicit binding.
    const gateId = t.proofGateId ?? (anyExplicitBinding ? undefined : soleObserveGate?.id);
    const r = resolveWitness(
      gateId !== undefined ? { witness: "machine", proofGateId: gateId } : { witness: "machine" },
      gates,
    );
    if (r.witness === "machine" && r.coverage === "observe") {
      return { kind: "observe", observedBy: r.observedBy, proofCommand: r.proofCommand };
    }
    const bound = gateId !== undefined ? gates.find((g) => g.id === gateId) : undefined;
    const reason =
      bound !== undefined && bound.kind === "observe" && bound.proofCommand === undefined
        ? `covering gate ${gateId} declares no command to observe`
        : r.witness === "machine"
          ? r.reason
          : "no proof-gate binding resolved";
    return { kind: "refused", reason };
  }

  const legResolutions = realLegs.map((t) => ({ leg: t, outcome: resolveLeg(t, reliabilityGates) }));
  const anyMachineRefused = legResolutions.some((lr) => lr.outcome.kind === "refused");

  const legLines: string[] = [];
  let signedLegs = 0;
  let humanLegs = 0;
  const buildTestsLegs = 0; // resolveWitness no longer routes to a `build-tests` coverage (retired)

  for (const { leg, outcome } of legResolutions) {
    if (outcome.kind === "human") {
      humanLegs += 1;
      legLines.push(`  ◻ ${leg.id} (human) — awaits your "I saw it work" verdict (ADR-0082)`);
      continue;
    }
    if (outcome.kind === "refused") {
      legLines.push(`  ✗ ${leg.id} (machine) — ${outcome.reason}`);
      continue;
    }
    // outcome.kind === "observe": would resolve fine on its own — but ANY invalid/unbound sibling
    // machine leg refuses the WHOLE UAT-signing pass (uat-bound-command-adoption: no partial verdict).
    if (anyMachineRefused) {
      legLines.push(
        `  ✗ ${leg.id} (machine) — not signed: an invalid/unbound sibling machine leg refuses the whole UAT-signing pass (no partial verdict)`,
      );
      continue;
    }
    const res = await observeAndSign({
      gate: { id: leg.id, kind: "observe", proofCommand: outcome.proofCommand },
      gitState,
      observe,
      approverInputs,
      store,
      runId,
      now,
    });
    if (res.ok) {
      signedLegs += 1;
      legLines.push(`  ✓ ${leg.id} (machine) adopted — observed via ${outcome.observedBy} (\`${outcome.proofCommand}\`)`);
    } else {
      legLines.push(`  ✗ ${leg.id} (machine) — ${res.reason}`);
    }
  }

  // The adoption DECISION: flip mapped → proposed ("adoption underway"). After signing, so the tree was
  // clean during signing; this edit dirties it with just the status line for the operator to commit.
  const flip = deps.flipStatusToProposed(id);
  const flipLine = flip.ok
    ? flip.changed
      ? "  → status flipped mapped → proposed (adoption underway, ADR-0097)"
      : "  → status already proposed (adoption underway)"
    : `  → status NOT flipped — ${flip.reason}`;

  const allSigned = signedGates === observeGates.length && signedLegs === realMachineLegs.length;
  const body = [
    `Adopt "${id}": ${signedGates}/${observeGates.length} observe gate(s) signed an \`adopted\` verdict.`,
    `  signer:     ${SPINE_PRINCIPAL} (the spine principal — the machine that witnessed the green)`,
    `  approvedBy: ${approver.signer} (who decided to adopt it)`,
    `  commit:     ${git.commitSha.slice(0, 7)}`,
    "",
    ...gateLines,
    ...(realLegs.length > 0
      ? [
          "",
          `UAT legs (ADR-0106): ${signedLegs}/${realMachineLegs.length} machine observe-signed · ${humanLegs} await your witness · ${buildTestsLegs} deferred to Build.`,
          ...legLines,
        ]
      : []),
    flipLine,
    "",
    allSigned
      ? "Adopt ENTERED the proving process (ADR-0097): the covered capabilities green via coverage and the\nmachine UAT legs are signed; any capability covered by no honest gate, or a leg deferred to Build,\nholds the crown at `proposed` until it is genuinely driven. No single gate greens the story — `healthy`\nstays non-authorable (ADR-0020); the `human` legs await your \"I saw it work\" (ADR-0082)."
      : "Some obligations were NOT adopted (see above). The story still ENTERED the proving process\n(proposed); resolve the failing obligation before its capabilities can green.",
  ].join("\n");

  return {
    ok: allSigned && flip.ok,
    body,
    next: [`storytree tree ${id} --pg`, `storytree gate list ${id} --pg`],
  };
}

/**
 * Wrap an `observe` runner so each DISTINCT command runs at most ONCE per adopt (the promise is cached).
 * A story's machine UAT legs are observed against the SAME suite their covering observe gate runs, so
 * without this the agent suite would re-run per leg; with it, one clean observation greens the gate AND
 * every leg it covers. Sound because adopt observes a single clean HEAD — the command is deterministic.
 */
function memoizeObserve(
  observe: (command: string) => Promise<{ code: number | null }>,
): (command: string) => Promise<{ code: number | null }> {
  const cache = new Map<string, Promise<{ code: number | null }>>();
  return (command) => {
    const hit = cache.get(command);
    if (hit !== undefined) return hit;
    const pending = observe(command);
    cache.set(command, pending);
    return pending;
  };
}

// ---------------------------------------------------------------------------
// Self-wiring entry (the studio worker + a future `storytree adopt` CLI command)
// ---------------------------------------------------------------------------

/** A story's adoptable facts from its spec on disk; null for a missing/odd spec. */
function loadAdoptStory(storiesDir: string, storyId: string): AdoptStory | null {
  const file = findNodeSpecFile(storiesDir, storyId);
  if (file === null) return null;
  try {
    const spec = loadNodeSpec(file);
    if (spec.tier !== "story") return null;
    return { status: spec.status, reliabilityGates: spec.reliabilityGates, uatTests: spec.uatTests };
  } catch {
    return null;
  }
}

/** The session repo's git state (HEAD + clean), or null when git can't answer (mirrors `uat`/`gate`). */
function readGitState(): { commitSha: string; clean: boolean } | null {
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

/** The spine's out-of-band observation of a gate's declared command (exit code only; mirrors `gate`). */
async function observeCommand(command: string): Promise<{ code: number | null }> {
  const parts = command.trim().split(/\s+/);
  const file = parts[0];
  if (file === undefined) return { code: null };
  const cmd = platformShellCommand({ file, args: parts.slice(1), cwd: repoRoot() });
  try {
    return { code: (await runShellCommand(cmd)).code };
  } catch {
    return { code: null }; // a genuine spawn failure (ENOENT) — did not run, so did not pass (fail-closed)
  }
}

/** Flip the story.md `status: mapped → proposed` on disk (the adoption decision, ADR-0097). */
function flipStatusFile(storiesDir: string, storyId: string): FlipResult {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file)) return { ok: false, reason: `story.md not found at ${rel(file)}` };
  const raw = readFileSync(file, "utf8");
  const flipped = flipFrontmatterStatus(raw, "mapped", "proposed");
  if (!flipped.ok) return flipped;
  if (flipped.changed) writeFileSync(file, flipped.content);
  return flipped;
}

/**
 * `adoptStory(storyId)` — the self-wiring ADOPT entry the studio worker drives (and a future
 * `storytree adopt` CLI command). Ensures the live DB is up, resolves the pg verdict store, wires the
 * git/observe/signer/status-flip seams, and runs the {@link runAdopt} core. Always persists (an
 * adopted verdict that does not land greens nothing).
 */
export async function adoptStory(
  storyId: string,
  opts: { actor?: string } = {},
): Promise<Envelope> {
  const storiesDir = path.join(repoRoot(), "stories");
  const retryCmd = `storytree adopt ${storyId}`;

  // The verdict store needs the instance up — probe + db:up + wait (mirrors nodeBuild's preflight).
  const ready = await ensureLiveDb((m) => console.error(`[db] ${m}`));
  if (!ready.ok) {
    return {
      ok: false,
      body: `adopt persists \`adopted\` verdicts to the live store, but the database could not be brought up:\n${ready.reason}`,
      next: ["pnpm db:status"],
    };
  }
  const storeChoice = await resolveVerdictStore("pg", false, retryCmd);
  if (!storeChoice.ok) return storeChoice.refusal;
  try {
    return await runAdopt(
      storyId,
      { ...(opts.actor !== undefined ? { signer: opts.actor } : {}) },
      {
        // PgWorkStore satisfies AdoptedVerdictStore (appendEvent); resolveVerdictStore('pg') returns it.
        store: storeChoice.store,
        loadStory: (id) => loadAdoptStory(storiesDir, id),
        gitState: readGitState,
        observe: observeCommand,
        resolveApprover: (flag) => resolveSignerFromEnv(flag !== undefined ? { flag } : undefined),
        flipStatusToProposed: (id) => flipStatusFile(storiesDir, id),
        now: () => new Date(),
      },
    );
  } finally {
    await storeChoice.close();
  }
}
