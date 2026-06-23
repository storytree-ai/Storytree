/**
 * `storytree gate` command (ADR-0085, resolving ADR-0083 Fork B — the brownfield reliability-gates
 * proof surface).
 *
 * A brownfield / foundational story declares a `## Reliability Gates` section — the author-owned
 * obligation set that flips it green, SEPARATE from `## Story UAT` (the integrated acceptance
 * journey; a pure port has none). Each gate is an addressable unit (`<story>#gate-<n>`) with a
 * `kind`:
 *  - `observe`      — "the existing suite / scaffolding works": earned by OBSERVE-AND-SIGN (this
 *                     command's `run`), which signs an `adopted` machine verdict (ADR-0085);
 *  - `build-tests`  — brownfield code with no test-first coverage; earned by a genuine red→green
 *                     build (`node build --real`), NOT observe-and-sign;
 *  - `integrate`    — an existing suite folded under one capability; earned when that capability greens.
 *
 *   storytree gate list <story-id> [--pg]        a story's reliability gates, kind + PROVEN state
 *   storytree gate run  <story>#gate-<n> --pg    observe-and-sign an `observe` gate (a real verdict)
 *
 * `run` is the machine counterpart of `uat attest`'s operator path: it mints an `adopted`
 * {@link Verdict} into `events.verdict` when the spine observes the gate's declared command GREEN at
 * a clean committed HEAD. The honesty walls (spine observes out-of-band; clean tree; persists or it
 * greens nothing; fail-closed on a non-observe kind / no command / a red / a blank signer) live in
 * the {@link observeAndSign} compute — this is the thin CLI driver that resolves the seams and runs
 * the command.
 *
 * Pure-by-injection: the store, git state, the command runner, the gate loader, the signer resolver
 * and the clock are all injected, so the whole command is offline-testable without a DB, a repo or a
 * real subprocess.
 */

import type { ReliabilityGate, UatTest } from "@storytree/library";
import {
  observeAndSign,
  rollupStatus,
  rollupStoryUat,
  type SignerResult,
} from "@storytree/orchestrator";
import type { StoreEvent } from "@storytree/storage-protocol";

import type { Envelope } from "./envelope.js";
import type { GitState } from "./uat.js";

// ---------------------------------------------------------------------------
// Seams
// ---------------------------------------------------------------------------

/** The verdict event log slice `gate` appends to / reads (PgWorkStore satisfies it). */
export interface GateVerdictStoreLike {
  appendEvent(e: {
    id: string;
    kind: string;
    type: "created";
    doc: unknown;
    actor?: string;
  }): Promise<StoreEvent>;
  readEvents(filter?: { id?: string }): Promise<StoreEvent[]>;
}

export interface GateDeps {
  /** The live verdict store when --pg; null offline (`gate run` then refuses, `gate list` omits PROVEN). */
  store: GateVerdictStoreLike | null;
  /** A story's declared reliability gates (parsed from its `## Reliability Gates` prose). */
  loadReliabilityGates: (storyId: string) => ReliabilityGate[];
  /** A story's per-test UAT tests — used only to surface the story's full own-proof set in `list`. */
  loadUatTests: (storyId: string) => UatTest[];
  /** The session repo's HEAD + clean-tree state; null when git can't answer (run then refuses). */
  gitState: () => GitState | null;
  /** The spine's out-of-band observation of a declared command (exit code as data). */
  observe: (command: string) => Promise<{ code: number | null }>;
  /** Injectable signer resolver (flag → STORYTREE_SIGNER → git email); fail-closed. */
  resolveSigner: (flag?: string) => SignerResult;
  /**
   * ADR-0098 (U2): drive a `build-tests` gate through the REAL prove-it-gate and sign a DRIVEN verdict
   * for the gate id (the gate borrows the `(build:)` node's `real:` config). Injected like `observe`
   * so this module stays pure + offline-testable — the worktree/store/leaf machinery lives behind the
   * seam (`gate-build-driver.ts`). Absent = the build path is not wired in this context (read-only /
   * offline), and a `--real` build-tests run refuses cleanly rather than half-driving.
   */
  driveBuildTestsGate?: (gate: ReliabilityGate, signer?: string) => Promise<Envelope>;
  now: () => Date;
}

export interface GateOpts {
  signer?: string;
  /**
   * `--real` (ADR-0098 U2): for a `build-tests` gate, DRIVE the referenced `(build:)` node's real
   * red→green and sign a driven verdict for the gate id (vs. the default refusal pointing at the
   * build). Ignored for `observe` / `integrate` (those are never earned by a build).
   */
  real?: boolean;
}

export interface GateInvocation {
  mode: "run" | "list";
  /** The gate id for `run` (`<story>#gate-<n>`), the story id for `list`. */
  target: string | undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The story id a gate belongs to (`<story>#gate-<n>` → `<story>`). */
function storyOf(gateId: string): string {
  const hash = gateId.indexOf("#");
  return hash > 0 ? gateId.slice(0, hash) : gateId;
}

/** The PROVEN glyph for one gate, from the SIGNED verdicts: ✓ a pass, ✗ a fail, – nothing yet. */
function provenGlyph(events: readonly StoreEvent[], gateId: string): "✓" | "✗" | "–" {
  const status = rollupStatus(gateId, events);
  if (status === "healthy") return "✓";
  if (status === "unhealthy") return "✗";
  return "–";
}

export function gateHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree gate — the brownfield reliability-gates proof surface (ADR-0085, ADR-0083 Fork B).",
      "A `## Reliability Gates` section is the author-declared obligation set that flips a brownfield /",
      "foundational story green — distinct from `## Story UAT`. An `observe` gate is proven by",
      "OBSERVE-AND-SIGN (the spine runs its declared command green at a clean HEAD → an `adopted` verdict).",
      "",
      "  storytree gate list <story-id> [--pg]               a story's gates, kind + PROVEN state",
      "  storytree gate run  <story>#gate-<n> --pg           observe-and-sign an `observe` gate",
      "  storytree gate run  <story>#gate-<n> --real --pg    drive a `build-tests` gate's red→green",
      "",
      "An `observe` run mints an 'adopted' verdict in events.verdict (a real gate verdict). A",
      "`build-tests` run (--real, ADR-0098) DRIVES the referenced `(build: <node-id>)` node's real",
      "red→green and signs a DRIVEN-tier verdict FOR the gate id (never 'adopted'), which greens the",
      "capability the gate `(covers:)`. run refuses a gate with no declared command (observe), a",
      "build-tests gate with no `(build:)` ref, a red command/walk, a dirty tree, a blank signer, and the",
      "offline store. gate ids come from: storytree gate list <id> --pg.",
    ].join("\n"),
    next: ["storytree gate list proof-protocol --pg", "storytree tree proof-protocol --pg"],
  };
}

// ---------------------------------------------------------------------------
// gateCommand
// ---------------------------------------------------------------------------

export async function gateCommand(
  inv: GateInvocation,
  opts: GateOpts,
  deps: GateDeps,
): Promise<Envelope> {
  return inv.mode === "list" ? gateList(inv.target, deps) : gateRun(inv.target, opts, deps);
}

// ── list ─────────────────────────────────────────────────────────────────────

async function gateList(storyId: string | undefined, deps: GateDeps): Promise<Envelope> {
  if (storyId === undefined || storyId.trim().length === 0) {
    return {
      ok: false,
      body: "gate list needs a story id: storytree gate list <story-id> --pg",
      next: ["storytree tree"],
    };
  }
  const gates = deps.loadReliabilityGates(storyId);
  if (gates.length === 0) {
    return {
      ok: true,
      body: `Story "${storyId}" declares no reliability gates (no \`## Reliability Gates\` items).`,
      next: ["storytree tree " + storyId],
    };
  }

  const events = deps.store === null ? null : await deps.store.readEvents();
  const idWidth = Math.max(...gates.map((g) => g.id.length));
  const lines = [`Reliability gates for "${storyId}" (${gates.length}):`, ""];
  for (const g of gates) {
    const proven = events === null ? "" : `  proven=${provenGlyph(events, g.id)}`;
    const cmd = g.proofCommand !== undefined ? `  \`${g.proofCommand}\`` : "";
    lines.push(`  ${g.id.padEnd(idWidth)}  kind=${g.kind.padEnd(11)}  ${g.title}${cmd}${proven}`);
  }
  lines.push("");
  if (events === null) {
    lines.push("reliability gates: (proven state needs the live store — re-run with --pg)");
  } else {
    const rolled = rollupStoryUat(gates, events);
    lines.push(
      "reliability gates: " +
        (rolled === "healthy"
          ? "GREEN — every gate has a signed pass"
          : rolled === "unhealthy"
            ? "WITHERED — a proven gate regressed to a signed fail"
            : "unproven — not every gate has a signed pass yet (the story under-claims)"),
    );
  }
  lines.push(
    "",
    "PROVEN (✓/✗/–) is the SIGNED verdict (events.verdict). An `observe` gate is proven via",
    "`storytree gate run <id> --pg`; a `build-tests` gate via `storytree gate run <id> --real --pg`",
    "(ADR-0098 — it drives the `(build:)` node's red→green and signs for the gate id); an `integrate`",
    "gate when its capability greens. The story CROWN (caps AND uat AND gates) is",
    "`storytree tree " + storyId + " --pg`.",
  );
  return {
    ok: true,
    body: lines.join("\n"),
    next: [
      `storytree gate run ${gates[0]!.id} --pg`,
      `storytree tree ${storyId} --pg`,
    ],
  };
}

// ── run ──────────────────────────────────────────────────────────────────────

async function gateRun(
  gateId: string | undefined,
  opts: GateOpts,
  deps: GateDeps,
): Promise<Envelope> {
  if (gateId === undefined || gateId.trim().length === 0) {
    return {
      ok: false,
      body: "gate run needs a gate id: storytree gate run <story>#gate-<n> --pg",
      next: ["storytree gate list <story-id> --pg"],
    };
  }
  const id = gateId.trim();
  const storyId = storyOf(id);

  // The gate must be a real DECLARED unit — a typo'd id never observes nothing.
  const gates = deps.loadReliabilityGates(storyId);
  const gate = gates.find((g) => g.id === id);
  if (gate === undefined) {
    return {
      ok: false,
      body:
        gates.length === 0
          ? `no reliability gate "${id}" — story "${storyId}" declares no \`## Reliability Gates\` (or its spec did not load).`
          : `no reliability gate "${id}" in story "${storyId}". declared: ${gates.map((g) => g.id).join(", ")}.`,
      next: [`storytree gate list ${storyId} --pg`],
    };
  }

  // ADR-0098 (U2): a `build-tests` gate is earned ONLY by a genuine red→green build driven through
  // the gate — never observe-and-sign (that would be the inverse theater ADR-0085/0097 ban). With
  // `--real`, route it to the build driver (the referenced `(build:)` node's real config, signed for
  // the gate id); without `--real` it refuses, pointing at the build. The observe-and-sign path below
  // is only ever reached for `observe` / `integrate`.
  if (gate.kind === "build-tests") {
    return gateRunBuildTests(gate, storyId, opts, deps);
  }

  // Fail-closed: a verdict must be attributed to a real signer.
  const resolved = deps.resolveSigner(opts.signer);
  if (!resolved.ok) {
    return {
      ok: false,
      body: `${resolved.error}\nName who is adopting it: --signer <email> (or set git user.email / STORYTREE_SIGNER).`,
      next: [`storytree gate run ${id} --signer <email> --pg`],
    };
  }

  // The write must persist (a verdict that evaporates greens nothing).
  if (deps.store === null) {
    return {
      ok: false,
      body: "gate run signs an `adopted` verdict to the live store (events.verdict) — run with --pg (bring the DB up: pnpm db:up).",
      next: ["pnpm db:up", `storytree gate run ${id} --pg`],
    };
  }

  // The verdict pins a commit, so the tree must be readable.
  const git = deps.gitState();
  if (git === null) {
    return {
      ok: false,
      body: "gate run could not read git state (HEAD / clean tree) — a verdict must pin a real commit. Run inside the repo.",
      next: [],
    };
  }

  const store = deps.store;
  const result = await observeAndSign({
    gate,
    gitState: async () => ({ commitSha: git.commitSha, clean: git.clean }),
    observe: deps.observe,
    // ADR-0097: the resolved identity is the human APPROVER (who is adopting); the verdict is SIGNED
    // by the spine principal (the machine that witnessed the green), recorded by observeAndSign.
    approverInputs: { flag: resolved.signer },
    store,
    runId: `gate-adopt:${deps.now().toISOString()}`,
    now: () => deps.now().toISOString(),
  });

  if (!result.ok) {
    // Only `observe` / `integrate` reach here — a `build-tests` gate is routed to the build driver
    // before observe-and-sign (gateRunBuildTests), so it never refuses through this path.
    return {
      ok: false,
      body: `refused — ${result.reason}`,
      next:
        gate.kind === "observe"
          ? [`storytree gate run ${id} --pg`]
          : [`storytree tree ${storyId} --pg   (an integrate gate greens when its capability does)`],
    };
  }

  // Re-read and report the story's reliability-gate roll-up AFTER this adoption.
  const events = await store.readEvents();
  const rolled = rollupStoryUat(gates, events);
  const lines = [
    `Adopted reliability gate "${id}".`,
    `  kind: ${gate.kind}`,
    `  command: ${gate.proofCommand}`,
    `  signer: ${result.verdict.signer} (the spine principal — the machine that witnessed the green)`,
    `  approvedBy: ${resolved.signer} (who decided to adopt it)`,
    `  commit: ${git.commitSha.slice(0, 7)}`,
    `  proof mode: adopted (a real machine verdict in events.verdict — observed green, no prior red)`,
    "",
    "reliability gates: " +
      (rolled === "healthy"
        ? "GREEN — every gate has a signed pass"
        : "unproven — not every gate has a signed pass yet"),
    "",
    "This is a SIGNED `adopted` verdict (events.verdict). The story CROWN greens when all capabilities",
    "AND all own-proof obligations (UAT tests + reliability gates) pass (ADR-0083 Fork A + ADR-0085).",
  ];
  return {
    ok: true,
    body: lines.join("\n"),
    next: [`storytree gate list ${storyId} --pg`, `storytree tree ${storyId} --pg`],
  };
}

// ── run: build-tests (ADR-0098 U2 — the gate→loop wiring) ──────────────────────

/**
 * Route a `build-tests` gate run. WITHOUT `--real` it refuses, pointing at the build (a build-tests
 * gate is never observe-and-signed). WITH `--real` it requires a `(build: <node-id>)` reference and
 * the injected build driver, then delegates the worktree/leaf/store machinery to the driver — which
 * signs a DRIVEN-tier verdict for THE GATE id (ADR-0098 d.4). This module stays pure: the I/O lives
 * behind `deps.driveBuildTestsGate`, exactly like the `observe` seam.
 */
async function gateRunBuildTests(
  gate: ReliabilityGate,
  storyId: string,
  opts: GateOpts,
  deps: GateDeps,
): Promise<Envelope> {
  if (opts.real !== true) {
    return {
      ok: false,
      body:
        `gate "${gate.id}" is kind 'build-tests' — it is earned by a genuine red→green build driven\n` +
        `through the gate (ADR-0098), not observe-and-sign. Run it with --real (and --pg to persist):\n` +
        `the build authors a brownfield seam (R2) or behaviour fix (R1) and signs a DRIVEN verdict for\n` +
        `the gate id, which greens the capability the gate \`(covers:)\`.`,
      next: [`storytree gate run ${gate.id} --real --pg`],
    };
  }
  if (gate.buildNode === undefined || gate.buildNode.trim().length === 0) {
    return {
      ok: false,
      body:
        `build-tests gate "${gate.id}" declares no build reference — a --real run borrows a node's\n` +
        `real: build config to drive the red→green. Add a \`(build: <node-id>)\` annotation to the gate's\n` +
        `prose (ADR-0098 U2), pointing at the buildable node whose seam this gate proves.`,
      next: [`storytree gate list ${storyId} --pg`],
    };
  }
  if (deps.driveBuildTestsGate === undefined) {
    return {
      ok: false,
      body:
        `gate run --real needs the build driver, which is not wired in this context (a read-only /\n` +
        `offline surface). Run it from the CLI with the live DB up (pnpm db:up).`,
      next: [`storytree gate run ${gate.id} --real --pg`],
    };
  }
  return deps.driveBuildTestsGate(gate, opts.signer);
}
