/**
 * `storytree uat` command (ADR-0082 — the per-test UAT write surface).
 *
 * A story's UAT decomposes into addressable per-test units (`<story>#uat-<n>`, ADR-0044
 * `uat-test-units`), and each test earns a REAL signed verdict by its declared witness: a `machine`
 * test by a machine proof (the gate), a `human` test by an `operator-attested` verdict signed by a
 * real person, an `either` test by whichever is produced. The story's OWN UAT then greens as the
 * AND-roll-up of those per-test verdicts (ADR-0082 d.3).
 *
 *   storytree uat attest <story>#uat-<n> [--outcome pass|fail] --pg   sign an operator attestation
 *   storytree uat list <story-id> [--pg]                              a story's UAT tests + proven state
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
import type { UatTest, UatTestWitness } from "@storytree/library";
import {
  checkUatProof,
  rollupStatus,
  rollupStoryUat,
  type SignerResult,
} from "@storytree/orchestrator";
import { SIGNING_EVENT_KIND, type Verdict } from "@storytree/proof-protocol";

import type { Envelope } from "./envelope.js";
import type { SessionIdentity } from "./noticeboard.js";

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
  /** A story's declared UAT tests (parsed from its `## Story UAT` prose). Injected for tests. */
  loadUatTests: (storyId: string) => UatTest[];
  /** The session repo's HEAD + clean-tree state; null when git can't answer (attest then refuses). */
  gitState: () => GitState | null;
  /** The session/agent identity, fed to {@link checkUatProof} as the no-self-attest guard. */
  identity: SessionIdentity | null;
  /** Injectable signer resolver (flag → STORYTREE_SIGNER → git email); fail-closed. */
  resolveSigner: (flag?: string) => SignerResult;
  now: () => Date;
}

export interface UatOpts {
  outcome?: string;
  signer?: string;
  note?: string;
}

export interface UatInvocation {
  mode: "attest" | "list";
  /** The test id for `attest` (`<story>#uat-<n>`), the story id for `list`. */
  target: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The story id a test belongs to (`<story>#uat-<n>` → `<story>`). */
function storyOf(testId: string): string {
  const hash = testId.indexOf("#");
  return hash > 0 ? testId.slice(0, hash) : testId;
}

/**
 * The PROVEN glyph for one test, derived from the SIGNED verdicts in the event log (never a vouch):
 * ✓ a signed pass, ✗ a signed fail, – nothing signed yet. Distinct from the ADR-0044 attestation
 * marks (◉/▣) — those are a relayed vouch, this is the gate verdict.
 */
function provenGlyph(events: readonly StoreEvent[], testId: string): "✓" | "✗" | "–" {
  const status = rollupStatus(testId, events);
  if (status === "healthy") return "✓";
  if (status === "unhealthy") return "✗";
  return "–";
}

/** Render the story's own UAT roll-up as a human line (ADR-0082 d.3 — the AND over per-test verdicts). */
function rollupLine(tests: readonly UatTest[], events: readonly StoreEvent[]): string {
  const rolled = rollupStoryUat(tests, events);
  if (rolled === "healthy") return "GREEN — every declared UAT test has a signed pass (the story's UAT is proven)";
  if (rolled === "unhealthy") return "WITHERED — a proven UAT test regressed to a signed fail";
  return "unproven — not every UAT test has a signed pass yet (the story's UAT under-claims)";
}

export function uatHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree uat — the per-test UAT proof surface (ADR-0082): each of a story's UAT tests earns a",
      "REAL signed verdict by its declared witness, and the story's own UAT greens as the AND-roll-up.",
      "",
      "  storytree uat list <story-id> [--pg]              a story's UAT tests, witness + PROVEN state",
      "  storytree uat attest <story>#uat-<n> [flags] --pg sign an operator attestation for one test",
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
      "test ids come from a story's UAT prose: storytree uat list <story-id> --pg.",
    ].join("\n"),
    next: ["storytree uat list <story-id> --pg", "storytree tree <story-id> --pg"],
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
  return inv.mode === "list" ? uatList(inv.target, deps) : uatAttest(inv.target, opts, deps);
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
  const tests = deps.loadUatTests(storyId);
  if (tests.length === 0) {
    return {
      ok: true,
      body: `Story "${storyId}" declares no UAT tests (no \`## Story UAT\` items).`,
      next: ["storytree tree " + storyId],
    };
  }

  // The proven state needs the signed-verdict log; offline (no --pg) the PROVEN column is absent,
  // exactly like the tree's verdict glyphs — the test list + witness still render.
  const events = deps.store === null ? null : await deps.store.readEvents();
  const idWidth = Math.max(...tests.map((t) => t.id.length));
  const lines = [`UAT tests for "${storyId}" (${tests.length}):`, ""];
  for (const t of tests) {
    const proven = events === null ? "" : `  proven=${provenGlyph(events, t.id)}`;
    lines.push(`  ${t.id.padEnd(idWidth)}  witness=${t.witness.padEnd(7)}  ${t.title}${proven}`);
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
      `storytree uat attest ${tests[0]!.id} --outcome pass --pg`,
      `storytree tree ${storyId} --pg`,
    ],
  };
}

// ── attest ───────────────────────────────────────────────────────────────────

async function uatAttest(
  testId: string | undefined,
  opts: UatOpts,
  deps: UatDeps,
): Promise<Envelope> {
  if (testId === undefined || testId.trim().length === 0) {
    return {
      ok: false,
      body: "uat attest needs a test id: storytree uat attest <story>#uat-<n> --outcome pass --pg",
      next: ["storytree uat list <story-id> --pg"],
    };
  }
  const id = testId.trim();
  const storyId = storyOf(id);

  // The test must be a real DECLARED unit — its witness drives the trust guard. A typo'd id never
  // signs a verdict against nothing.
  const tests = deps.loadUatTests(storyId);
  const test = tests.find((t) => t.id === id);
  if (test === undefined) {
    return {
      ok: false,
      body:
        tests.length === 0
          ? `no UAT test "${id}" — story "${storyId}" declares no UAT tests (or its spec did not load).`
          : `no UAT test "${id}" in story "${storyId}". declared: ${tests.map((t) => t.id).join(", ")}.`,
      next: [`storytree uat list ${storyId} --pg`],
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
      next: [`storytree uat attest ${id} --outcome ${outcome} --signer <email> --pg`],
    };
  }
  const signer = resolved.signer;

  // HONESTY WALL 1 (ADR-0082 d.2): the sign-time trust guard. Refuse a machine-witness test (it needs
  // a machine proof, not a click), an agent self-attestation (sandbox: / the building session), or a
  // blank signer — BEFORE any write. The compute is the single source of this rule (uat-proof.ts).
  const guard = checkUatProof({
    witness: test.witness as UatTestWitness,
    verdict: { proofMode: "operator-attested", signer },
    ...(deps.identity !== null ? { agentIdentity: deps.identity.sessionId } : {}),
  });
  if (!guard.ok) {
    return {
      ok: false,
      body: `refused — ${guard.reason}`,
      next:
        test.witness === "machine"
          ? [`storytree node build ${storyId} --real   (a machine-witness test is proven by its machine proof)`]
          : [`storytree uat attest ${id} --outcome ${outcome} --signer <a real operator email> --pg`],
    };
  }

  // HONESTY WALL 2: the write must persist (a verdict that evaporates greens nothing).
  if (deps.store === null) {
    return {
      ok: false,
      body: "uat attest writes a signed verdict to the live store (events.verdict) — run with --pg (bring the DB up first: pnpm db:up).",
      next: ["pnpm db:up", `storytree uat attest ${id} --outcome ${outcome} --pg`],
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
      next: ["git status", `storytree uat attest ${id} --outcome ${outcome} --pg`],
    };
  }

  const at = deps.now().toISOString();
  const runId = `uat-attest:${at}`;
  const verdict: Verdict = {
    unitId: id,
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
    next: [`storytree uat list ${storyId} --pg`, `storytree tree ${storyId} --pg`],
  };
}
