import * as fs from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  proveUnit,
  realBuildableNodeIds,
  registeredNodeIds,
  resolveProveSpec,
} from "@storytree/orchestrator";
import type { BuildWorktree, NodeSpec, ResolveOptions } from "@storytree/orchestrator";

import type { Envelope } from "./envelope.js";

/**
 * `storytree node build <id> --dry-run` (drive-machinery Phase C): drive a REAL node spec through
 * the prove-it-gate end-to-end, offline. The walk is the prove-it-gate.e2e.test.ts wiring —
 * a scripted phase-aware model + real file writes + a real Node test run in a fresh temp
 * workspace — parameterized by the real spec (real id, real prompts, real proof mode), against an
 * InMemoryStore (NEVER the live library DB; nothing persists past the command).
 *
 * HONEST FRAMING (repeated in the envelope): a dry-run proves the GLUE — spec → ProveSpec → gate →
 * signed verdict → rollup — not the node's actual proofs. The model is scripted and the red→green
 * is synthetic. `--live` is gated on owner decisions (API key, budget — plan Phase 0/D).
 */

const HONEST_FRAMING_DRY =
  "honest framing: a dry-run proves the GLUE (spec → ProveSpec → gate → verdict → rollup), NOT the\n" +
  "node's actual proofs — the model is scripted and the red→green is synthetic in a temp workspace.\n" +
  "The node's authored status is untouched; the verdict landed in an in-memory store and is gone.";

const HONEST_FRAMING_LIVE =
  "honest framing: a live smoke proves the LIVE LOOP through the gate — a real Claude Agent SDK leaf\n" +
  "(ADR-0030, subscription-funded) genuinely authored the test and impl under hook-enforced write\n" +
  "scope, and the spine observed the genuine red→green those writes caused. The TASK is still the\n" +
  "synthetic add(2,3) pair in a temp workspace — the node's REAL proof command was not run (Phase F).\n" +
  "The node's authored status is untouched; the verdict landed in an in-memory store and is gone.";

const HONEST_FRAMING_REAL =
  "honest framing: a REAL build (Phase F). What was real: a fresh git worktree of THIS repo, the\n" +
  "node's REAL test/impl files at their real repo paths authored by a live Claude Agent SDK leaf\n" +
  "under hook-enforced write scope, the registry's REAL proof command run by the spine for both\n" +
  "red and green, a spine-side commit of the authored files, and a GATE that read genuine\n" +
  "`git status` off that worktree. What is still NOT proven: the authored commit lives only in the\n" +
  "temp worktree (unreferenced after cleanup — landing it is later promotion work), the verdict\n" +
  "landed in an in-memory store and is gone, and only the node's registered proof command ran (not\n" +
  "the full package suite — the worktree has no node_modules by design, builtins-only targets).";

/** The repo root, resolved from this file's location (packages/cli/src → four dirs up). */
function repoRoot(): string {
  return path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
}

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
  /** Injectable for tests; defaults to `<repoRoot>/stories`. */
  storiesDir?: string;
}

/** `storytree node build <id> --dry-run` — the full dry-run walk, returned as one envelope. */
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

  // The build sandbox: dry-run/live-smoke walk in a fresh EMPTY temp dir; REAL walks in a fresh
  // DETACHED git worktree of this repo (the node's real source at real paths). Either way the
  // verdict store is a fresh InMemoryStore — never the live library DB; nothing persists.
  const runId = `${mode}-${Date.now().toString(36)}`;
  const store = new InMemoryStore();
  let worktree: BuildWorktree | undefined;
  let workspace: string;
  if (real) {
    worktree = await createBuildWorktree(repoRoot());
    workspace = worktree.root;
  } else {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-node-build-"));
  }
  try {
    // The lifecycle mark a real build starts with — gives the rollup something real to project.
    await store.appendEvent(
      workEvent({ unitId: spec.id, event: "building", runId }, signer.signer),
    );

    const sdkOpts = {
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.budgetUsd !== undefined ? { maxBudgetUsd: opts.budgetUsd } : {}),
    };
    const resolveOptions: ResolveOptions = real
      ? {
          mode: "real",
          workspace,
          store,
          runId,
          signerInputs: { flag: signer.signer },
          ...sdkOpts,
        }
      : live
        ? {
            mode: "live-smoke",
            workspace,
            store,
            runId,
            signerInputs: { flag: signer.signer },
            ...sdkOpts,
          }
        : { mode: "dry-run", workspace, store, runId, signerInputs: { flag: signer.signer } };
    const resolved = resolveProveSpec(spec, resolveOptions);
    if (!resolved.ok) {
      return {
        ok: false,
        body: `${resolved.reason}\n(spec loaded fine: ${rel(specFile)})`,
        next: resolved.registered.map((id) => `storytree node build ${id} --dry-run`),
      };
    }

    const result = await proveUnit(resolved.spec);
    const derived = rollupStatus(spec.id, await store.readEvents());
    const header = [
      `node build ${spec.id} — ${mode.toUpperCase()}`,
      "",
      `spec:        ${rel(specFile)}`,
      `proof mode:  ${spec.proofMode} → ${resolved.spec.proofMode}`,
      `run:         ${runId}`,
      `signer:      ${signer.signer}`,
      ...(real && worktree !== undefined && realConfig !== undefined
        ? [
            `worktree:    ${workspace} (detached @ ${worktree.headSha.slice(0, 7)}, removed after)`,
            `real proof:  node --import tsx --test ${realConfig.testFile}`,
          ]
        : []),
      ...(resolved.liveAuthor !== undefined
        ? [
            `leaf:        Claude Agent SDK (${resolved.liveAuthor.runs.map((r) => `${r.phase}: ${r.subtype}, ${r.turns} turns`).join("; ") || "no slices ran"})`,
            `cost:        $${resolved.liveAuthor.totalCostUsd.toFixed(4)} SDK-reported (subscription-billed)`,
            `scope walls: ${resolved.liveAuthor.violations.length === 0 ? "no write refusals" : resolved.liveAuthor.violations.map((v) => `${v.phase}:${v.path}`).join(", ")}`,
          ]
        : []),
      "",
      `phase trail: ${result.phasesVisited.join(" → ")}`,
    ];
    const framing = real ? HONEST_FRAMING_REAL : live ? HONEST_FRAMING_LIVE : HONEST_FRAMING_DRY;
    const modeFlag = real ? "--real" : live ? "--live" : "--dry-run";

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
    if (worktree !== undefined) {
      await worktree.remove();
    } else {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  }
}

/** Repo-relative display path (forward slashes, stable across platforms). */
function rel(file: string): string {
  return path.relative(repoRoot(), file).replace(/\\/g, "/");
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
      `buildable (registered) nodes: ${registeredNodeIds().join(", ")}`,
      `REAL-buildable nodes:         ${realBuildableNodeIds().join(", ") || "(none yet)"}`,
    ].join("\n"),
    next: ["storytree node build library-cli --dry-run"],
  };
}
