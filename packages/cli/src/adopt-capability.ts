/**
 * `storytree adopt capability <capability-id> --pg` — the CAPABILITY-GRAIN adoption surface
 * (ADR-0465 D4). The thin live-seam wiring around drive's pure-by-injection `runAdoptCapability`,
 * mirroring how `adopt.ts` wires `runAdopt`: every honesty wall lives in drive and is tested there
 * (`adopt-capability.test.ts`); this module only resolves the real disk, git, store and signer seams.
 *
 * WHY A SECOND ENTRY RATHER THAN A WIDER FIRST ONE. `storytree adopt <story>` runs at STORY grain and
 * refuses any status but `mapped` (ADR-0423 D1, tightening ADR-0417 D4) — deliberately, because
 * ADR-0395 makes `proposed` the GREENFIELD status, so authored `proposed` is not evidence a story
 * ever entered brownfield adoption. ADR-0465 D4 is explicit that this guard is NOT to be deleted; it
 * is to be JOINED by a narrower entry whose evidence is the owner's recorded attestation rather than
 * the story's status. That is this command, and it can never reach a story: drive refuses any tier
 * but `capability` and points a story back at the status-guarded entry.
 */

import { execFileSync } from "node:child_process";

import {
  runAdoptCapability,
  readVerdictEvents,
  type AdoptCapabilityDeps,
  type AdoptCapabilityOpts,
  type AdoptCapabilitySpec,
  type VerdictReaderLike,
} from "@storytree/drive";
import type { Status } from "@storytree/proof-protocol";
import {
  findNodeSpecFile,
  loadNodeSpec,
  rollupStatus,
  type NodeBuildConfig,
  type ShellCommand,
} from "@storytree/orchestrator";

import type { Envelope } from "./envelope.js";

// ---------------------------------------------------------------------------
// Spec projection
// ---------------------------------------------------------------------------

/** Render a declared {@link ShellCommand} back to the one-line form the spine observes. */
export function renderCommand(command: ShellCommand): string {
  return [command.file, ...command.args].join(" ").trim();
}

/**
 * The command an adoption OBSERVES: the `real:` arm's override when the spec declares one, else the
 * node's base proof command. Both are the author's own declaration of what exercises this capability
 * — this never invents one, because a command nobody declared is not evidence of anything.
 */
export function declaredCommand(config: NodeBuildConfig | undefined): string | undefined {
  if (config === undefined) return undefined;
  const command = config.real?.proofCommand ?? config.command;
  const rendered = renderCommand(command);
  return rendered.length > 0 ? rendered : undefined;
}

/**
 * The source this capability declares as its OWN — the `real:` arm's `sourceFile` plus the write
 * scope's `sourceGlobs`. The service-history fence matches the branch diff against these, so a spec
 * that declares neither cannot be fenced and drive refuses it.
 */
export function declaredSourcePaths(config: NodeBuildConfig | undefined): string[] {
  if (config === undefined) return [];
  const paths = new Set<string>(config.scope.sourceGlobs);
  if (config.real?.sourceFile !== undefined) paths.add(config.real.sourceFile);
  return [...paths];
}

/** Load a capability spec off disk and project just the slice the adoption compute reads. */
export function loadAdoptCapability(storiesDir: string, id: string): AdoptCapabilitySpec | null {
  const file = findNodeSpecFile(storiesDir, id);
  if (file === null) return null;
  let spec;
  try {
    spec = loadNodeSpec(file);
  } catch {
    return null;
  }
  const projected: AdoptCapabilitySpec = {
    id: spec.id,
    tier: spec.tier,
    title: spec.title,
    story: spec.story,
    proofCommand: declaredCommand(spec.buildConfig),
    sourcePaths: declaredSourcePaths(spec.buildConfig),
    file,
  };
  return projected;
}

// ---------------------------------------------------------------------------
// Git seams
// ---------------------------------------------------------------------------

function git(root: string, args: readonly string[]): string | null {
  try {
    return execFileSync("git", [...args], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** Repo-relative, forward-slashed paths from a `git … --name-only` listing. */
function pathLines(raw: string | null): string[] {
  if (raw === null || raw.length === 0) return [];
  return raw
    .split("\n")
    .map((l) => l.trim().replace(/\\/g, "/"))
    .filter((l) => l.length > 0);
}

/**
 * What THIS BRANCH authored, measured against `git merge-base origin/main HEAD` — the same anchor
 * `check:verification-decay` and the gate's affected-scope classifier use, so the three cannot
 * disagree about what "this branch" means.
 *
 * `git diff --name-only <base>` with no second revision compares the base to the WORKING TREE, so
 * uncommitted edits count as this branch's — they are. Untracked files are added separately: an
 * untracked new source file is unambiguously this branch's and git's diff does not list it.
 *
 * `origin/main` is read LOCALLY and never fetched (CLAUDE.md: no reflexive fetch). A STALE ref only
 * makes the base older, which can only WIDEN the authored set and therefore only over-fence — the
 * safe direction for a guard whose job is to refuse. A MISSING ref returns `null`, and drive refuses
 * on it: with no base there is no "before", and a fence that fails open is not a fence.
 */
export function branchAuthoredPaths(root: string): readonly string[] | null {
  const mergeBase = git(root, ["merge-base", "origin/main", "HEAD"]);
  if (mergeBase === null || mergeBase.length === 0) return null;
  const diff = git(root, ["diff", "--name-only", mergeBase]);
  if (diff === null) return null;
  const touched = new Set(pathLines(diff));
  for (const p of pathLines(git(root, ["ls-files", "--others", "--exclude-standard"]))) {
    touched.add(p);
  }
  return [...touched];
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function adoptCapabilityHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree adopt capability <capability-id> --pg — adopt ONE capability on the owner's recorded",
      "risk acceptance (ADR-0465 D2/D4), for work that is ALREADY built and ALREADY serving.",
      "",
      "WHY IT EXISTS. ADR-0443 D6 asked every unproven capability to earn its own driven verdict, but",
      "CONFIRM_RED is fail-closed: a capability whose implementation and test already exist, with a",
      "command that already passes, has NO RED LEFT to observe. The run halts, signs nothing, and costs",
      "~$2-3. ADR-0465 narrows D6 for exactly that population.",
      "",
      "WHAT IT SIGNS. The spine RE-RUNS the capability's declared command and OBSERVES it green at a",
      "clean committed HEAD, then signs an `adopted` verdict bound to the capability. The signer is the",
      "spine principal (the machine that watched the exit code); `approvedBy` is YOU — the party",
      "ACCEPTING THE RISK, never the signer, and no model signs either. This is deliberately stronger",
      "than the flip to green the owner asked for: a bare flip would record a state with no observation",
      "behind it.",
      "",
      "WHAT IT REFUSES, all before any spend:",
      "  · a STORY (that is `storytree adopt <story> --pg`, which keeps its own `mapped`-only guard —",
      "    this entry joins that guard with a different evidence basis, it never widens it)",
      "  · a capability that already holds its own signed pass (re-stamping could only lose it)",
      "  · a signed FAIL (a red is fixed, never adopted)",
      "  · a capability declaring NO proof command — nothing for the spine to observe. Author a `proof:`",
      "    block naming the command that already exercises it. If none does, that IS the finding: the",
      "    capability is unbuilt (prove it strictly) or not capability-shaped (route it to story-author).",
      "  · a capability whose source THIS BRANCH authored — adoption rests on work already serving, and",
      "    a capability adopted in the same landing that authored it is self-attestation (ADR-0465)",
      "  · a blank approver, the offline store, and a DIRTY tree (the verdict pins the commit observed)",
      "",
      "`adopted` is NOT a lesser verdict than a driven pass — the two differ in KIND, not rank (D7). A",
      "driven red→green is a forward-looking fence over one behaviour its author thought to check; time",
      "in service is evidence over every path real use actually took. No surface may render `driven` as",
      "the senior mode. What service history cannot speak to is the path nobody took.",
    ].join("\n"),
    next: [
      "storytree adopt capability <capability-id> --signer <email> --pg",
      "storytree tree <story-id>",
    ],
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** The live seams this surface resolves, injected so the routing stays offline-testable. */
export interface AdoptCapabilityWiring {
  storiesDir: string;
  repoRoot: string;
  verdicts: VerdictReaderLike | null;
  store: AdoptCapabilityDeps["store"];
  gitState: AdoptCapabilityDeps["gitState"];
  observe: AdoptCapabilityDeps["observe"];
  resolveApprover: AdoptCapabilityDeps["resolveApprover"];
}

/**
 * Wire the live seams and run the adoption. The capability's OWN status is folded with
 * `rollupStatus` — NOT `rollupCapStatus`: a covering gate is someone else's verdict, and refusing on
 * it would make this entry depend on a fold it does not own. An unreadable store folds to `null`
 * (genuinely unproven), which is the conservative reading and never a false green.
 */
export async function adoptCapabilityCommand(
  capabilityId: string | undefined,
  opts: AdoptCapabilityOpts,
  wiring: AdoptCapabilityWiring,
): Promise<Envelope> {
  const deps: AdoptCapabilityDeps = {
    loadCapability: (id) => loadAdoptCapability(wiring.storiesDir, id),
    ownStatus: async (id): Promise<Status | null> => {
      const events = await readVerdictEvents(wiring.verdicts);
      return events === null ? null : rollupStatus(id, events);
    },
    branchAuthoredPaths: () => branchAuthoredPaths(wiring.repoRoot),
    gitState: wiring.gitState,
    observe: wiring.observe,
    resolveApprover: wiring.resolveApprover,
    store: wiring.store,
    now: () => new Date(),
  };
  return runAdoptCapability(capabilityId, opts, deps);
}
