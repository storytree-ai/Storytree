/**
 * `storytree uat` command (ADR-0082 — the per-test UAT write surface).
 *
 * A story's UAT decomposes into addressable criteria with authored opaque ids and content-bound
 * revisions (ADR-0253), and each criterion earns a REAL signed verdict by its declared witness: a `machine`
 * test by a machine proof (the gate), a `human` test by an `operator-attested` verdict signed by a
 * real person, an `either` test by whichever is produced. The story's OWN UAT then greens as the
 * AND-roll-up of those per-test verdicts (ADR-0082 d.3).
 *
 *   storytree uat attest <story-id> <uatc_id> [--outcome pass|fail] --pg   sign an operator attestation
 *   storytree uat list <story-id> [--pg]                              a story's UAT test criteria + proven state
 *
 * `attest` is the OPERATOR-ATTESTED path only — it mints an `operator-attested` {@link Verdict} into
 * `events.verdict` (a real gate verdict, NOT the lower-rigor `events.attestation` vouch that
 * `storytree attest` writes). Three honesty walls, all spine-side, none bypassable:
 *  - the sign-time trust guard {@link checkUatProof} (ADR-0082 d.2) runs BEFORE the verdict is
 *    written — a machine-witness test refuses operator attestation (run the machine proof), and an
 *    agent identity (`sandbox:` / the building session) can never self-attest a human test;
 *  - the write refuses without `--pg` (a verdict that does not persist greens nothing); and
 *  - it refuses on a DIRTY tree — the verdict pins a `commitSha`, and an attestation of a tree with
 *    uncommitted edits would claim a commit that does not match what was observed (fail-closed,
 *    the build path's clean-tree posture).
 *
 * Pure-by-injection: the verdict store, the git state, the UAT-test loader, the signer resolver and
 * the clock are all injected, so the whole command is offline-testable without a DB, a repo, or a
 * real signing chain.
 */

import type { StoreEvent } from "@storytree/storage-protocol";
import type {
  UatTestCriterion,
  UatTestCriterionWitness,
  UatWitnessCensusStory,
} from "@storytree/library";
import {
  UAT_TEST_CRITERION_WITNESSES,
  censusUatWitnesses,
  recomputeUatRevisionIds,
} from "@storytree/library";
import {
  checkUatProof,
  rollupCriterionStatus,
  rollupStoryUat,
  type SignerResult,
} from "@storytree/orchestrator";
import { SIGNING_EVENT_KIND, type Verdict } from "@storytree/proof-protocol";

import type { Envelope } from "./envelope.js";
import type { SessionIdentity } from "@storytree/drive";

// ---------------------------------------------------------------------------
// Seams
// ---------------------------------------------------------------------------

/** The verdict event log slice this command appends to / reads (PgWorkStore satisfies it). */
export interface UatVerdictStoreLike {
  appendEvent(e: {
    id: string;
    kind: string;
    type: "created";
    doc: unknown;
    actor?: string;
  }): Promise<StoreEvent>;
  readEvents(filter?: { id?: string }): Promise<StoreEvent[]>;
}

/** The session repo's git state an attestation pins itself to: the HEAD it attests, and is it clean? */
export interface GitState {
  commitSha: string;
  clean: boolean;
}

export interface UatDeps {
  /** The live verdict store when --pg; null offline (the write/read of proven state both need it). */
  store: UatVerdictStoreLike | null;
  /** A story's declared UAT test criteria (parsed from its `## UAT Test Criteria` prose). Injected for tests. */
  loadUatTestCriteria: (storyId: string) => UatTestCriterion[];
  /** The session repo's HEAD + clean-tree state; null when git can't answer (attest then refuses). */
  gitState: () => GitState | null;
  /** The session/agent identity, fed to {@link checkUatProof} as the no-self-attest guard. */
  identity: SessionIdentity | null;
  /** Injectable signer resolver (flag → STORYTREE_SIGNER → git email); fail-closed. */
  resolveSigner: (flag?: string) => SignerResult;
  now: () => Date;
  /** One story's raw spec markdown; null when it has none on disk. Read pre-parse by `rerevision`. */
  readStoryBody: (storyId: string) => string | null;
  /** Overwrite one story's spec — the `--write` half of `rerevision`. */
  writeStoryBody: (storyId: string, body: string) => void;
  /** Every story document in the corpus, for `census`. */
  readCorpusStories: () => UatWitnessCensusStory[];
}

export interface UatOpts {
  outcome?: string;
  signer?: string;
  note?: string;
  /** `rerevision --write`: apply the recompute rather than only reporting it. */
  write?: boolean;
}

export interface UatInvocation {
  mode: "attest" | "list" | "rerevision" | "census";
  /** The opaque criterion id for `attest`, the story id for `list`/`rerevision`, unused for `census`. */
  target: string | undefined;
  /** Required for attest: opaque criterion ids intentionally do not encode their story. */
  storyId?: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The PROVEN glyph for one test, derived from the SIGNED verdicts in the event log (never a vouch):
 * ✓ a signed pass, ✗ a signed fail, – nothing signed yet. Distinct from the ADR-0044 attestation
 * marks (◉/▣) — those are a relayed vouch, this is the gate verdict.
 */
function provenGlyph(
  events: readonly StoreEvent[],
  criterion: Pick<UatTestCriterion, "criterionId" | "revisionId">,
): "✓" | "✗" | "–" {
  const status = rollupCriterionStatus(criterion, events);
  if (status === "healthy") return "✓";
  if (status === "unhealthy") return "✗";
  return "–";
}

/** Render the story's own UAT roll-up as a human line (ADR-0082 d.3 — the AND over per-test verdicts). */
function rollupLine(tests: readonly UatTestCriterion[], events: readonly StoreEvent[]): string {
  const rolled = rollupStoryUat(tests, events);
  if (rolled === "healthy") return "GREEN — every declared UAT test has a signed pass (the story's UAT is proven)";
  if (rolled === "unhealthy") return "WITHERED — a proven UAT test regressed to a signed fail";
  return "unproven — not every UAT test has a signed pass yet (the story's UAT under-claims)";
}

export function uatHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree uat — the per-test UAT proof surface (ADR-0082): each of a story's UAT test criteria earns a",
      "REAL signed verdict by its declared witness, and the story's own UAT greens as the AND-roll-up.",
      "",
      "  storytree uat list <story-id> [--pg]              a story's UAT test criteria, witness + PROVEN state",
      "  storytree uat attest <story-id> <uatc_id> [flags] --pg sign an operator attestation for one criterion",
      "  storytree uat rerevision <story-id> [--write]     recompute content-bound revision ids (ADR-0253)",
      "  storytree uat census                             the corpus witness distribution, via the real parser",
      "",
      "rerevision: the (witness:)/(proof-gate:) tags are INSIDE the hashed canonical content, so any",
      "flip or prose edit invalidates a criterion's (revision-id:) and the story stops parsing for every",
      "reader. Bare it REPORTS the drift and writes nothing; --write applies it, recording each",
      "superseded value as (previous-revision-id:). No criterionId is ever renumbered or re-matched.",
      "",
      "census: counts through parseUatTestCriteria, never a grep — the witness tag has two written",
      "forms (standalone, and fused with a detail pointer), so a literal scan undercounts silently.",
      "",
      "attest flags:",
      "  --outcome pass|fail   what the operator observed        (default pass)",
      "  --signer <id>         the operator who observed         (else STORYTREE_SIGNER / git email)",
      "  --note <text>         free-text note (recorded as evidence)",
      "",
      "attest mints an 'operator-attested' verdict in events.verdict — a real gate verdict, NOT the",
      "lower-rigor events.attestation vouch that `storytree attest` writes. It refuses a machine-witness",
      "test (run the machine proof), an agent self-attestation, a dirty tree, and the offline store.",
      "",
      "criterion ids come from Markdown and are shown by: storytree uat list <story-id> --pg.",
      "Legacy <story>#uat-<n> keys remain preserved history and cannot receive current proof.",
    ].join("\n"),
    next: [
      "storytree uat list <story-id> --pg",
      "storytree uat census",
      "storytree tree <story-id> --pg",
    ],
  };
}

// ---------------------------------------------------------------------------
// uatCommand
// ---------------------------------------------------------------------------

export async function uatCommand(
  inv: UatInvocation,
  opts: UatOpts,
  deps: UatDeps,
): Promise<Envelope> {
  if (inv.mode === "list") return uatList(inv.target, deps);
  if (inv.mode === "rerevision") return uatRerevision(inv.target, opts, deps);
  if (inv.mode === "census") return uatCensus(deps);
  return uatAttest(inv.storyId, inv.target, opts, deps);
}

// ── rerevision ───────────────────────────────────────────────────────────────

/**
 * `storytree uat rerevision <story-id> [--write]` — recompute a story's content-bound revision ids.
 *
 * The `(witness:)` and `(proof-gate:)` tags sit INSIDE the hashed canonical content, so any flip or
 * prose edit invalidates a criterion's `(revision-id:)` and makes the parser throw for the WHOLE
 * story — surfacing later in `tree`, `uat list`, `adopt`, `story build`, the studio and the desktop
 * backend, none of which name the edit that caused it. This is that recompute as a verb rather than
 * the throwaway script every session used to write into a package's `src/`.
 *
 * Identity is never touched: `criterionId` is authored and immutable and list position carries no
 * identity (ADR-0253), so nothing here renumbers or re-matches a criterion. A drifted criterion keeps
 * its id and records the superseded value as `(previous-revision-id:)`, which is what keeps an
 * already-signed verdict pointing at the revision it actually observed.
 */
function uatRerevision(
  storyId: string | undefined,
  opts: UatOpts,
  deps: UatDeps,
): Envelope {
  if (storyId === undefined || storyId.trim().length === 0) {
    return {
      ok: false,
      body: "uat rerevision needs a story id: storytree uat rerevision <story-id> [--write]",
      next: ["storytree uat census", "storytree tree"],
    };
  }
  const story = storyId.trim();
  const body = deps.readStoryBody(story);
  if (body === null) {
    return {
      ok: false,
      body: `no story spec for "${story}" (looked for stories/${story}/story.md).`,
      next: ["storytree tree"],
    };
  }

  let result;
  try {
    result = recomputeUatRevisionIds(story, body);
  } catch (error) {
    // Fail-closed: an item whose identity annotations cannot be read is refused, never repaired past.
    return {
      ok: false,
      body:
        `refused — ${error instanceof Error ? error.message : String(error)}\n` +
        "A criterion's identity is AUTHORED (ADR-0253). Fix the annotation by hand; this verb will\n" +
        "never invent, re-match or renumber an identity to make a story parse.",
      next: [`storytree uat rerevision ${story}`],
    };
  }

  if (result.drifted.length === 0) {
    return {
      ok: true,
      body: `"${story}": ${result.checked} criterion revision(s) checked — all bind their current content. Nothing to do.`,
      next: [`storytree uat list ${story} --pg`],
    };
  }

  const drift = result.drifted.map(
    (d) => `  ${d.criterionId}\n    authored: ${d.authoredRevisionId}\n    expected: ${d.expectedRevisionId}`,
  );

  if (opts.write !== true) {
    return {
      ok: false,
      body: [
        `"${story}": ${result.drifted.length} of ${result.checked} criterion revision(s) no longer bind their content.`,
        "",
        ...drift,
        "",
        "The story does not parse in this state — every reader of it (tree, uat list, adopt, story",
        "build, the studio) fails until the revisions are recomputed. Nothing was written.",
        "",
        "Apply it with --write. Each superseded value is recorded as (previous-revision-id:), so the",
        "criterion keeps its authored identity and gains history — no id is renumbered or re-matched.",
      ].join("\n"),
      next: [`storytree uat rerevision ${story} --write`],
    };
  }

  deps.writeStoryBody(story, result.body);
  return {
    ok: true,
    body: [
      `"${story}": recomputed ${result.drifted.length} of ${result.checked} criterion revision(s).`,
      "",
      ...drift,
      "",
      "Each superseded value was recorded as (previous-revision-id:); every criterionId is unchanged.",
    ].join("\n"),
    next: [`storytree uat list ${story} --pg`, "git diff"],
  };
}

// ── census ───────────────────────────────────────────────────────────────────

/**
 * `storytree uat census` — the corpus's witness distribution, counted through the REAL parser.
 *
 * The `witness:` tag has two written forms — standalone `_(witness: human)_` and fused with a detail
 * pointer `_(witness: human)(detail: <story>#uat-<n>)_` — so a grep for either literal returns a
 * partial census indistinguishable from a complete one. Measured on origin/main @ 984fd554, the
 * standalone-literal scan saw 27 legs across 10 stories where the parser saw 42 across 17; the
 * undercount reached two accepted ADRs and needed correction commits, and 11 legs were never
 * classified at all. This verb exists so that count is never hand-rolled again.
 */
function uatCensus(deps: UatDeps): Envelope {
  let census;
  try {
    census = censusUatWitnesses(deps.readCorpusStories());
  } catch (error) {
    return {
      ok: false,
      body:
        `refused — ${error instanceof Error ? error.message : String(error)}\n` +
        "A census that skipped an unreadable story would under-report exactly like a grep does.",
      next: ["storytree uat rerevision <story-id> --write"],
    };
  }

  const width = Math.max(...UAT_TEST_CRITERION_WITNESSES.map((w) => w.length));
  const rows = UAT_TEST_CRITERION_WITNESSES.map(
    (w) =>
      `  ${w.padEnd(width)}  ${String(census.byWitness[w]).padStart(4)} leg(s)` +
      `  across ${String(census.storiesByWitness[w]).padStart(3)} story/stories`,
  );

  return {
    ok: true,
    body: [
      `UAT witness census — ${census.total} criterion(s) across ${census.storiesWithCriteria} story/stories:`,
      "",
      ...rows,
      "",
      ...(census.wouldBe > 0
        ? [`  ${census.wouldBe} of these are declared under a (would-be) heading — exclude them knowingly.`, ""]
        : []),
      "Counted through parseUatTestCriteria — the same reader the gate, the tree, the build and the",
      "studio use. The witness tag has TWO written forms (standalone, and fused with a detail",
      "pointer), so a grep for either literal silently undercounts while looking complete: that is",
      "how a wrong population reached ADR-0348 and, through a correct-in-place edit, ADR-0295.",
    ].join("\n"),
    next: ["storytree uat list <story-id> --pg", "storytree uat rerevision <story-id>"],
  };
}

// ── list ─────────────────────────────────────────────────────────────────────

async function uatList(storyId: string | undefined, deps: UatDeps): Promise<Envelope> {
  if (storyId === undefined || storyId.trim().length === 0) {
    return {
      ok: false,
      body: "uat list needs a story id: storytree uat list <story-id> --pg",
      next: ["storytree tree"],
    };
  }
  const tests = deps.loadUatTestCriteria(storyId);
  if (tests.length === 0) {
    return {
      ok: true,
      body: `Story "${storyId}" declares no UAT test criteria (no \`## UAT Test Criteria\` items).`,
      next: ["storytree tree " + storyId],
    };
  }

  // The proven state needs the signed-verdict log; offline (no --pg) the PROVEN column is absent,
  // exactly like the tree's verdict glyphs — the test list + witness still render.
  const events = deps.store === null ? null : await deps.store.readEvents();
  const idWidth = Math.max(...tests.map((t) => t.criterionId.length));
  const lines = [`UAT test criteria for "${storyId}" (${tests.length}):`, ""];
  for (const t of tests) {
    const proven = events === null ? "" : `  proven=${provenGlyph(events, t)}`;
    lines.push(
      `  ${t.criterionId.padEnd(idWidth)}  witness=${t.witness.padEnd(7)}  ${t.title}${proven}`,
    );
  }
  lines.push("");
  lines.push(
    events === null
      ? "story UAT: (proven state needs the live store — re-run with --pg)"
      : `story UAT: ${rollupLine(tests, events)}`,
  );
  lines.push(
    "",
    "PROVEN (✓/✗/–) is the SIGNED verdict (events.verdict), distinct from the ADR-0044 attestation",
    "marks (◉/▣, a relayed vouch). A human-witness test is proven via `storytree uat attest`; a",
    "machine-witness test via its machine proof (the gate).",
  );
  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      `storytree uat attest ${storyId} ${tests[0]!.criterionId} --outcome pass --pg`,
      `storytree tree ${storyId} --pg`,
    ],
  };
}

// ── attest ───────────────────────────────────────────────────────────────────

async function uatAttest(
  storyId: string | undefined,
  criterionId: string | undefined,
  opts: UatOpts,
  deps: UatDeps,
): Promise<Envelope> {
  if (
    storyId === undefined ||
    storyId.trim().length === 0 ||
    criterionId === undefined ||
    criterionId.trim().length === 0
  ) {
    return {
      ok: false,
      body: "uat attest needs a story id and criterion id: storytree uat attest <story-id> <uatc_id> --outcome pass --pg",
      next: ["storytree uat list <story-id> --pg"],
    };
  }
  const story = storyId.trim();
  const id = criterionId.trim();

  // The test must be a real DECLARED unit — its witness drives the trust guard. A typo'd id never
  // signs a verdict against nothing.
  const tests = deps.loadUatTestCriteria(story);
  const test = tests.find((t) => t.criterionId === id);
  if (test === undefined) {
    return {
      ok: false,
      body:
        tests.length === 0
          ? `no UAT criterion "${id}" — story "${story}" declares no UAT test criteria (or its spec did not load).`
          : `no UAT criterion "${id}" in story "${story}". declared: ${tests.map((t) => t.criterionId).join(", ")}.`,
      next: [`storytree uat list ${story} --pg`],
    };
  }

  const outcome = opts.outcome ?? "pass";
  if (outcome !== "pass" && outcome !== "fail") {
    return { ok: false, body: `--outcome must be pass|fail (got "${outcome}").`, next: [] };
  }

  // Fail-closed: a verdict must be attributed to a real operator (the signer who observed).
  const resolved = deps.resolveSigner(opts.signer);
  if (!resolved.ok) {
    return {
      ok: false,
      body:
        `${resolved.error}\nName the operator who observed: --signer <email> (or set git user.email / STORYTREE_SIGNER).`,
      next: [`storytree uat attest ${story} ${id} --outcome ${outcome} --signer <email> --pg`],
    };
  }
  const signer = resolved.signer;

  // HONESTY WALL 1 (ADR-0082 d.2): the sign-time trust guard. Refuse a machine-witness test (it needs
  // a machine proof, not a click), an agent self-attestation (sandbox: / the building session), or a
  // blank signer — BEFORE any write. The compute is the single source of this rule (uat-proof.ts).
  const guard = checkUatProof({
    witness: test.witness as UatTestCriterionWitness,
    verdict: { proofMode: "operator-attested", signer },
    ...(deps.identity !== null ? { agentIdentity: deps.identity.sessionId } : {}),
  });
  if (!guard.ok) {
    return {
      ok: false,
      body: `refused — ${guard.reason}`,
      next:
        test.witness === "machine"
          ? [`storytree node build ${story} --real   (a machine-witness test is proven by its machine proof)`]
          : [`storytree uat attest ${story} ${id} --outcome ${outcome} --signer <a real operator email> --pg`],
    };
  }

  // HONESTY WALL 2: the write must persist (a verdict that evaporates greens nothing).
  if (deps.store === null) {
    return {
      ok: false,
      body: "uat attest writes a signed verdict to the live store (events.verdict) — run with --pg (bring the DB up first: pnpm db:up).",
      next: ["pnpm db:up", `storytree uat attest ${story} ${id} --outcome ${outcome} --pg`],
    };
  }

  // HONESTY WALL 3: the verdict pins a commit, so the tree must be clean — an attestation of a tree
  // with uncommitted edits would claim a commit that does not match what was observed (fail-closed).
  const git = deps.gitState();
  if (git === null) {
    return {
      ok: false,
      body: "uat attest could not read git state (HEAD / clean tree) — a verdict must pin a real commit. Run inside the repo.",
      next: [],
    };
  }
  if (!git.clean) {
    return {
      ok: false,
      body:
        "refused — the working tree is DIRTY. An operator attestation pins a commit (the state observed);\n" +
        "signing against uncommitted edits would attest a commit that does not match what you saw.\n" +
        "Commit (or stash) first, then attest the clean commit.",
      next: ["git status", `storytree uat attest ${story} ${id} --outcome ${outcome} --pg`],
    };
  }

  const at = deps.now().toISOString();
  const runId = `uat-attest:${at}`;
  const verdict: Verdict = {
    unitId: id,
    criterionId: test.criterionId,
    revisionId: test.revisionId,
    proofMode: "operator-attested",
    outcome,
    commitSha: git.commitSha,
    signer,
    runId,
    outputVersion: "v1",
    evidence: [
      {
        kind: "operator-attested",
        ref: signer,
        ...(opts.note !== undefined && opts.note.trim().length > 0
          ? { note: opts.note.trim() }
          : {}),
      },
    ],
    at,
  };

  await deps.store.appendEvent({
    id: `${runId}:${id}`,
    kind: SIGNING_EVENT_KIND,
    type: "created",
    doc: verdict,
    actor: signer,
  });

  // Re-read and report the story's UAT roll-up AFTER this attestation, so the operator sees whether
  // their signature greened the story (the AND over every declared per-test verdict, ADR-0082 d.3).
  const events = await deps.store.readEvents();
  const lines = [
    `Signed an operator attestation for "${id}".`,
    `  outcome:    ${outcome}`,
    `  witness:    ${test.witness}`,
    `  signer:     ${signer}   (the operator who observed)`,
    `  commit:     ${git.commitSha.slice(0, 7)}`,
    `  proof mode: operator-attested   (a real gate verdict in events.verdict)`,
    ...(opts.note !== undefined && opts.note.trim().length > 0 ? [`  note:       ${opts.note.trim()}`] : []),
    "",
    `story UAT:  ${rollupLine(tests, events)}`,
    "",
    "This is a SIGNED verdict (events.verdict), not the lower-rigor events.attestation vouch. It greens",
    "the story's UAT only when EVERY declared per-test verdict passes (ADR-0082 d.3).",
  ];
  return {
    ok: true,
    body: lines.join("\n"),
    next: [`storytree uat list ${story} --pg`, `storytree tree ${story} --pg`],
  };
}
