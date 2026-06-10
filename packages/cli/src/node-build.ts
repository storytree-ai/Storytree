import * as fs from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ClaudeAgentAuthor } from "@storytree/agent";
import type { Store } from "@storytree/core";
import {
  InMemoryStore,
  resolveSignerFromEnv,
  rollupStatus,
  workEvent,
} from "@storytree/core";
import {
  createBuildWorktree,
  findNodeSpecFile,
  loadNodeSpec,
  lookupNodeBuildConfig,
  mapProofMode,
  proveUnit,
  realBuildableNodeIds,
  registeredNodeIds,
  resolveProveSpec,
} from "@storytree/orchestrator";
import type {
  BuildWorktree,
  NodeSpec,
  ProveResult,
  ResolveOptions,
} from "@storytree/orchestrator";
import { applySchema, closePool, createPool, PgWorkStore } from "@storytree/store";

import type { Envelope } from "./envelope.js";

/**
 * `storytree node build <id> --dry-run` (drive-machinery Phase C): drive a REAL node spec through
 * the prove-it-gate end-to-end, offline. The walk is the prove-it-gate.e2e.test.ts wiring —
 * a scripted phase-aware model + real file writes + a real Node test run in a fresh temp
 * workspace — parameterized by the real spec (real id, real prompts, real proof mode), against an
 * InMemoryStore by default. `--store pg` (PR #29's parked decision 4) swaps the VERDICT store for
 * the live `PgWorkStore` (`events.work_event` + `events.verdict`) on `--live`/`--real` only — a
 * scripted dry-run PASS persisted to the shared store would be a forged healthy (ADR-0020).
 *
 * HONEST FRAMING (repeated in the envelope): a dry-run proves the GLUE — spec → ProveSpec → gate →
 * signed verdict → rollup — not the node's actual proofs. The model is scripted and the red→green
 * is synthetic. `--live` is the ADR-0030 SDK smoke (subscription-funded, SDK-enforced budget).
 */

const HONEST_FRAMING_DRY =
  "honest framing: a dry-run proves the GLUE (spec → ProveSpec → gate → verdict → rollup), NOT the\n" +
  "node's actual proofs — the model is scripted and the red→green is synthetic in a temp workspace.\n" +
  "The node's authored status is untouched; the verdict landed in an in-memory store and is gone.";

function honestFramingLive(persisted: boolean): string {
  return (
    "honest framing: a live smoke proves the LIVE LOOP through the gate — a real Claude Agent SDK leaf\n" +
    "(ADR-0030, subscription-funded) genuinely authored the test and impl under hook-enforced write\n" +
    "scope, and the spine observed the genuine red→green those writes caused. The TASK is still the\n" +
    "synthetic add(2,3) pair in a temp workspace — the node's REAL proof command was not run (Phase F).\n" +
    `The node's authored status is untouched; ${verdictFate(persisted)}.`
  );
}

function honestFramingReal(persisted: boolean): string {
  return (
    "honest framing: a REAL build (Phase F). What was real: a fresh git worktree of THIS repo, the\n" +
    "node's REAL test/impl files at their real repo paths authored by a live Claude Agent SDK leaf\n" +
    "under hook-enforced write scope, the registry's REAL proof command run by the spine for both\n" +
    "red and green, a spine-side commit of the authored files, and a GATE that read genuine\n" +
    "`git status` off that worktree. What is still NOT proven: the authored commit lives only in the\n" +
    "temp worktree (unreferenced after cleanup — landing it is later promotion work)" +
    (persisted ? "" : ", the verdict\nlanded in an in-memory store and is gone") +
    ", and only the\nnode's registered proof command ran (not the full package suite — the worktree has no\n" +
    "node_modules by design, builtins-only targets)." +
    (persisted
      ? "\nWhat DID persist: the signed verdict — events.verdict in the shared store (the rollup can\nderive from it across sessions)."
      : "")
  );
}

function verdictFate(persisted: boolean): string {
  return persisted
    ? "the signed verdict PERSISTED to the shared store (events.verdict — the rollup can derive from it across sessions)"
    : "the verdict landed in an in-memory store and is gone";
}

/** The repo root, resolved from this file's location (packages/cli/src → four dirs up). */
export function repoRoot(): string {
  return path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
}

/** Repo-relative display path (forward slashes, stable across platforms). */
export function rel(file: string): string {
  return path.relative(repoRoot(), file).replace(/\\/g, "/");
}

// ── The verdict store seam (`--store pg`, PR #29 parked decision 4) ─────────

export type VerdictStoreChoice =
  | { ok: true; store: Store; persisted: boolean; label: string; close: () => Promise<void> }
  | { ok: false; refusal: Envelope };

/**
 * Resolve the verdict store for a build: in-memory by default; `--store pg` swaps in the
 * {@link PgWorkStore} over the live Cloud SQL tables. Fail-closed twice over: any value other
 * than `pg` is refused, and `pg` is refused for SCRIPTED walks — a dry-run's PASS is synthetic
 * by construction, and persisting it would plant a forged `healthy` in the shared event log
 * (exactly what ADR-0020 exists to prevent).
 */
export async function resolveVerdictStore(
  flag: string | undefined,
  scripted: boolean,
  retryCmd: string,
): Promise<VerdictStoreChoice> {
  if (flag === undefined) {
    return {
      ok: true,
      store: new InMemoryStore(),
      persisted: false,
      label: "in-memory (nothing persists past this run)",
      close: async () => {},
    };
  }
  if (flag !== "pg") {
    return {
      ok: false,
      refusal: {
        ok: false,
        body: `unknown --store "${flag}" — the only persistent verdict store is "pg" (events.work_event + events.verdict).`,
        next: [`${retryCmd} --store pg`],
      },
    };
  }
  if (scripted) {
    return {
      ok: false,
      refusal: {
        ok: false,
        body:
          "--store pg is refused for a scripted (dry-run) walk: its PASS is synthetic by construction,\n" +
          "and persisting it would plant a forged `healthy` in the shared event log (ADR-0020 — proof is\n" +
          "non-authorable). Persist verdicts only from --live or --real builds.",
        next: [`${retryCmd} --store pg`],
      },
    };
  }
  try {
    const { pool, connector } = await createPool();
    await applySchema(pool); // idempotent CREATE IF NOT EXISTS — self-heals a pre-Phase-A live DB
    return {
      ok: true,
      store: new PgWorkStore(pool),
      persisted: true,
      label: "pg — events.work_event + events.verdict (PERSISTED to the shared store)",
      close: () => closePool(pool, connector),
    };
  } catch (e) {
    return {
      ok: false,
      refusal: {
        ok: false,
        body:
          `--store pg could not reach the live store: ${(e as Error).message}\n` +
          "the instance is STOPPED by default — bring it up and set the IAM user first.",
        next: ["pnpm db:up", "STORYTREE_DB_USER=<iam-email>", retryCmd + " --store pg"],
      },
    };
  }
}

// ── The single-node drive (shared by `node build` and `story build`) ────────

export interface DriveNodeArgs {
  mode: "dry-run" | "live-smoke";
  /** The event store the building mark + signed verdict land in (shared across a story run). */
  store: Store;
  runId: string;
  /** The resolved signer (also the work-event actor). */
  signer: string;
  /** SDK leaf model (live only). */
  model?: string;
  /** Per-authoring-slice USD ceiling, SDK-enforced (live only). */
  budgetUsd?: number;
}

export type DriveNodeResult =
  | { resolved: true; result: ProveResult; liveAuthor?: ClaudeAgentAuthor }
  | { resolved: false; reason: string; registered: string[] };

/**
 * Drive ONE node through the gate in a fresh temp workspace: append the `building` lifecycle
 * mark, resolve the spec into a ProveSpec (dry-run: scripted owned loop; live-smoke: the SDK
 * leaf), walk `proveUnit`, and clean the workspace up. The caller owns the store, the runId and
 * the signer — that is what lets `story build` chain nodes over ONE store/run.
 */
export async function driveNode(spec: NodeSpec, args: DriveNodeArgs): Promise<DriveNodeResult> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-node-build-"));
  try {
    await args.store.appendEvent(
      workEvent(
        { unitId: spec.id, event: "building", runId: args.runId, tier: spec.tier },
        args.signer,
      ),
    );
    const sdkOpts = {
      ...(args.model !== undefined ? { model: args.model } : {}),
      ...(args.budgetUsd !== undefined ? { maxBudgetUsd: args.budgetUsd } : {}),
    };
    const resolveOptions: ResolveOptions =
      args.mode === "live-smoke"
        ? {
            mode: "live-smoke",
            workspace,
            store: args.store,
            runId: args.runId,
            signerInputs: { flag: args.signer },
            ...sdkOpts,
          }
        : {
            mode: "dry-run",
            workspace,
            store: args.store,
            runId: args.runId,
            signerInputs: { flag: args.signer },
          };
    const resolved = resolveProveSpec(spec, resolveOptions);
    if (!resolved.ok) {
      return { resolved: false, reason: resolved.reason, registered: resolved.registered };
    }
    const result = await proveUnit(resolved.spec);
    return {
      resolved: true,
      result,
      ...(resolved.liveAuthor !== undefined ? { liveAuthor: resolved.liveAuthor } : {}),
    };
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

/** The per-node leaf summary lines shared by the node and story envelopes. */
export function liveLeafLines(liveAuthor: ClaudeAgentAuthor): string[] {
  return [
    `leaf:        Claude Agent SDK (${liveAuthor.runs.map((r) => `${r.phase}: ${r.subtype}, ${r.turns} turns`).join("; ") || "no slices ran"})`,
    `cost:        $${liveAuthor.totalCostUsd.toFixed(4)} SDK-reported (subscription-billed)`,
    `scope walls: ${liveAuthor.violations.length === 0 ? "no write refusals" : liveAuthor.violations.map((v) => `${v.phase}:${v.path}`).join(", ")}`,
  ];
}

// ── `storytree node build` ───────────────────────────────────────────────────

export interface NodeBuildOpts {
  dryRun: boolean;
  /** `--live` — the ADR-0030 live smoke: a real Claude Agent SDK leaf authors through the gate. */
  live?: boolean;
  /** `--real` — Phase F: the leaf authors the node's REAL proof in a fresh git worktree. */
  real?: boolean;
  /** `--model` — the SDK leaf's model (live/real only). Default: claude-sonnet-4-6. */
  model?: string;
  /** `--budget` — per-authoring-slice USD ceiling, SDK-enforced (live/real only). Default: 1. */
  budgetUsd?: number;
  /** `--actor` — the signer chain's flag tier (flag → STORYTREE_SIGNER → git email). */
  actor?: string;
  /** `--store` — the verdict store: absent = in-memory, `pg` = the live work tables (live/real only). */
  verdictStore?: string;
  /** Injectable for tests; defaults to `<repoRoot>/stories`. */
  storiesDir?: string;
}

/** `storytree node build <id>` — the full walk in one envelope (dry-run | live smoke | real). */
export async function nodeBuild(
  unitId: string | undefined,
  opts: NodeBuildOpts,
): Promise<Envelope> {
  if (unitId === undefined) {
    return {
      ok: false,
      body: "node build needs an id: storytree node build <id> --dry-run | --live",
      next: registeredNodeIds().map((id) => `storytree node build ${id} --dry-run`),
    };
  }
  const live = opts.live === true;
  const real = opts.real === true;
  const picked = [opts.dryRun, live, real].filter(Boolean).length;
  if (picked !== 1) {
    return {
      ok: false,
      body:
        "pick exactly one mode:\n" +
        "  --dry-run   offline scripted walk (zero cost)\n" +
        "  --live      ADR-0030 live smoke: a real Claude Agent SDK leaf authors the SYNTHETIC\n" +
        "              add(2,3) pair through the gate (subscription-funded; needs Claude Code\n" +
        "              auth / CLAUDE_CODE_OAUTH_TOKEN)\n" +
        "  --real      Phase F: the leaf authors the node's REAL test/impl in a fresh git\n" +
        "              worktree; the spine runs the node's REAL proof command and commits the\n" +
        "              authored files before the GATE reads the real tree",
      next: [
        `storytree node build ${unitId} --dry-run`,
        `storytree node build ${unitId} --live`,
        `storytree node build ${unitId} --real`,
      ],
    };
  }
  const mode = real ? "real" : live ? "live-smoke" : "dry-run";

  // Fail-closed before any work: a verdict must be attributable (flag → env → git email).
  const signer = resolveSignerFromEnv(
    opts.actor !== undefined ? { flag: opts.actor } : {},
  );
  if (!signer.ok) {
    return {
      ok: false,
      body: `no signer resolved — a verdict must be attributable.\n${signer.error}`,
      next: [`storytree node build ${unitId} --dry-run --actor <email>`],
    };
  }

  const storiesDir = opts.storiesDir ?? path.join(repoRoot(), "stories");
  const specFile = findNodeSpecFile(storiesDir, unitId);
  if (specFile === null) {
    return {
      ok: false,
      body: `no node spec "${unitId}" under ${storiesDir} (looked for <story>/${unitId}.md and ${unitId}/story.md).`,
      next: registeredNodeIds().map((id) => `storytree node build ${id} --dry-run`),
    };
  }
  let spec: NodeSpec;
  try {
    spec = loadNodeSpec(specFile);
  } catch (e) {
    return {
      ok: false,
      body: `node spec ${specFile} failed to load:\n${(e as Error).message}`,
      next: ["storytree node build <id> --dry-run"],
    };
  }

  // REAL mode fail-closed precheck BEFORE any worktree is cut: the node must carry a real-proof
  // registry config (the resolver re-checks this; the precheck just keeps the refusal cheap).
  const realConfig = lookupNodeBuildConfig(spec.id)?.real;
  if (real && realConfig === undefined) {
    const buildable = realBuildableNodeIds();
    return {
      ok: false,
      body:
        `node "${spec.id}" is not REAL-buildable — its registry entry has no real-proof config ` +
        `(real.testFile/sourceFile/scope).\nREAL-buildable nodes: ${buildable.join(", ") || "(none yet)"}`,
      next: buildable.map((id) => `storytree node build ${id} --real`),
    };
  }

  const modeFlag = real ? "--real" : live ? "--live" : "--dry-run";
  const storeChoice = await resolveVerdictStore(
    opts.verdictStore,
    mode === "dry-run",
    `storytree node build ${spec.id} ${modeFlag}`,
  );
  if (!storeChoice.ok) return storeChoice.refusal;
  const { store, persisted } = storeChoice;

  const runId = `${mode}-${Date.now().toString(36)}`;
  try {
    let result: ProveResult;
    let liveAuthor: ClaudeAgentAuthor | undefined;
    let worktree: BuildWorktree | undefined;

    if (real) {
      // The REAL walk: a fresh DETACHED git worktree of this repo (the node's real source at
      // real paths); the spine commits the authored files before the GATE reads the real tree.
      worktree = await createBuildWorktree(repoRoot());
      try {
        await store.appendEvent(
          workEvent(
            { unitId: spec.id, event: "building", runId, tier: spec.tier },
            signer.signer,
          ),
        );
        const resolveOptions: ResolveOptions = {
          mode: "real",
          workspace: worktree.root,
          store,
          runId,
          signerInputs: { flag: signer.signer },
          ...(opts.model !== undefined ? { model: opts.model } : {}),
          ...(opts.budgetUsd !== undefined ? { maxBudgetUsd: opts.budgetUsd } : {}),
        };
        const resolved = resolveProveSpec(spec, resolveOptions);
        if (!resolved.ok) {
          return {
            ok: false,
            body: `${resolved.reason}\n(spec loaded fine: ${rel(specFile)})`,
            next: resolved.registered.map((id) => `storytree node build ${id} --dry-run`),
          };
        }
        result = await proveUnit(resolved.spec);
        liveAuthor = resolved.liveAuthor;
      } finally {
        await worktree.remove();
      }
    } else {
      const drive = await driveNode(spec, {
        mode: live ? "live-smoke" : "dry-run",
        store,
        runId,
        signer: signer.signer,
        ...(opts.model !== undefined ? { model: opts.model } : {}),
        ...(opts.budgetUsd !== undefined ? { budgetUsd: opts.budgetUsd } : {}),
      });
      if (!drive.resolved) {
        return {
          ok: false,
          body: `${drive.reason}\n(spec loaded fine: ${rel(specFile)})`,
          next: drive.registered.map((id) => `storytree node build ${id} --dry-run`),
        };
      }
      result = drive.result;
      liveAuthor = drive.liveAuthor;
    }

    const derived = rollupStatus(spec.id, await store.readEvents());
    const header = [
      `node build ${spec.id} — ${mode.toUpperCase()}`,
      "",
      `spec:        ${rel(specFile)}`,
      `proof mode:  ${spec.proofMode} → ${mapProofMode(spec.proofMode)}`,
      `run:         ${runId}`,
      `signer:      ${signer.signer}`,
      `store:       ${storeChoice.label}`,
      ...(real && worktree !== undefined && realConfig !== undefined
        ? [
            `worktree:    ${worktree.root} (detached @ ${worktree.headSha.slice(0, 7)}, removed after)`,
            `real proof:  node --import tsx --test ${realConfig.testFile}`,
          ]
        : []),
      ...(liveAuthor !== undefined ? liveLeafLines(liveAuthor) : []),
      "",
      `phase trail: ${result.phasesVisited.join(" → ")}`,
    ];
    const framing = real
      ? honestFramingReal(persisted)
      : live
        ? honestFramingLive(persisted)
        : HONEST_FRAMING_DRY;

    if (!result.ok) {
      return {
        ok: false,
        body: [
          ...header,
          `verdict:     NONE — failed closed at ${result.failedAt}: ${result.reason}`,
          `rollup:      ${derived ?? "(no derived status)"} (authored status stands: ${spec.status})`,
          "",
          framing,
        ].join("\n"),
        next: [`storytree node build ${spec.id} ${modeFlag}`],
      };
    }

    return {
      ok: true,
      body: [
        ...header,
        `verdict:     ${result.verdict.outcome.toUpperCase()} — signed by ${result.verdict.signer} at ${result.verdict.at} (commit ${result.verdict.commitSha})`,
        `evidence:    ${result.verdict.evidence.map((e) => e.kind).join(", ")}`,
        `rollup:      ${derived} (derived from the event log: building → signed pass; authored status in the spec stays ${spec.status})`,
        "",
        framing,
      ].join("\n"),
      next: [
        `storytree node build <id> ${modeFlag}   (any registered node)`,
        `storytree library artifact ${spec.id}   (if it has a Library artifact)`,
      ],
    };
  } finally {
    await storeChoice.close();
  }
}

export function nodeHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree node — drive a node through the prove-it-gate (ADR-0020).",
      "",
      "  storytree node build <id> --dry-run [--actor <email>]",
      "      walk a real node spec through AUTHOR_TEST → … → GATE with a scripted model in a",
      "      temp workspace: zero API cost, no live DB. Proves the drive-machinery glue, not",
      "      the node's actual proofs.",
      "",
      "  storytree node build <id> --live [--model <id>] [--budget <usd>] [--actor <email>]",
      "      the ADR-0030 live smoke: a REAL Claude Agent SDK leaf (subscription-funded) authors",
      "      the synthetic red→green pair through the gate under hook-enforced write scope.",
      "      Needs Claude Code auth (CLAUDE_CODE_OAUTH_TOKEN). Default budget: $1/slice.",
      "",
      "  storytree node build <id> --real [--model <id>] [--budget <usd>] [--actor <email>]",
      "      Phase F — the REAL build: a fresh git worktree of this repo, the leaf authors the",
      "      node's REAL test/impl at their real paths, the spine runs the node's REAL proof",
      "      command for red/green, commits the authored files, and the GATE reads genuine git",
      "      state. Needs Claude Code auth. The authored commit is not landed (promotion is later).",
      "",
      "  --store pg   (--live/--real only) persist the building mark + signed verdict to the",
      "      live work tables (events.work_event/events.verdict) instead of an in-memory store.",
      "      Needs the DB up (pnpm db:up) and STORYTREE_DB_USER. Refused for --dry-run — a",
      "      scripted PASS persisted to the shared store would be a forged healthy (ADR-0020).",
      "",
      `buildable (registered) nodes: ${registeredNodeIds().join(", ")}`,
      `REAL-buildable nodes:         ${realBuildableNodeIds().join(", ") || "(none yet)"}`,
    ].join("\n"),
    next: ["storytree node build library-cli --dry-run", "storytree story build library --dry-run"],
  };
}
