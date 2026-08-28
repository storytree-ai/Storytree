// `runAdoptCapability` — CAPABILITY-GRAIN adoption on the owner's recorded risk acceptance
// (ADR-0465 D4). The second, NARROWER entry into the `adopted` proof mode, standing beside the
// story-grain `runAdopt` in `./adopt.ts` rather than replacing it.
//
// WHY IT EXISTS. ADR-0443 D6 ordered 71 unproven capabilities to "earn their own real signed verdict
// from their own run". For most of them that is structurally impossible: `CONFIRM_RED` is fail-closed
// (`packages/orchestrator/src/phase-machine.ts` — "the red must be observed before any
// implementation"), and a capability whose implementation AND test already exist, with a declared
// command that already passes, HAS NO RED LEFT to observe. The run halts, signs nothing, and costs
// real money. ADR-0465 narrows D6 for exactly that population: the built-and-passing survivors are
// ADOPTED on the owner's explicit risk acceptance rather than proven.
//
// WHY IT IS NOT A "FLIP TO GREEN". The owner asked to "just flip them green". What is built here is
// deliberately STRONGER (ADR-0465 D2): a bare flip would record a state with no observation behind
// it, whereas `adopted` keeps a machine in the loop for the half a machine can still do — the
// declared command IS re-run and IS observed green at a clean committed HEAD, with the spine as
// signer. What the owner supplies is the half no machine can: the acceptance that a passing suite
// plus a long complaint-free service history is a sufficient basis. He is `approvedBy` (the party
// accepting the risk), never the signer, and no model signs either.
//
// WHY IT DOES NOT WEAKEN ADR-0020. Nobody types "this works" into a file. `adopted` is a real signed
// verdict with a DIFFERENT, NAMED basis (ADR-0085), first-class and renderable, and never silently
// equated with a driven pass. `healthy` stays non-authorable — green still arrives only through a
// signed verdict row this function appends, and on ANY refusal below nothing is written at all.
//
// ⚠ THE STORY-GRAIN `mapped`-ONLY GUARD IS NOT DELETED, AND MUST NOT BE (ADR-0465 D4, ADR-0423 D1).
// `runAdopt` refuses any story status but `mapped` because authored `proposed` is not evidence a
// story ever entered adoption — ADR-0395 makes `proposed` the GREENFIELD status, so accepting it
// would treat every greenfield story as resumable brownfield. This entry does not widen that guard;
// it JOINS it with a different evidence basis. Here the evidence is not the story's status but the
// owner's recorded attestation, resolved through the same fail-closed signer chain, plus the
// service-history fence below.
//
// ⚠ THE FENCE THAT MAKES THIS HONEST, AND THE REASON IT IS NOT OPTIONAL (ADR-0465 Consequences).
// Adoption is the cheap route, and once it exists at capability grain a session under time pressure
// will reach for it before driving a real proof. ADR-0465 names the intended limit in one line:
// adoption is for work that is ALREADY built and ALREADY serving, never for work a session has just
// written — "a capability adopted in the same landing that authored it is self-attestation wearing
// the brownfield's clothes". {@link branchAuthoredPaths} is that sentence made mechanical: if this
// branch created or modified the capability's own declared source, the adoption REFUSES. A fence a
// caller can walk around is not a fence, so this one is fail-closed on an unreadable base too.

import type { Status } from "@storytree/proof-protocol";
import {
  observeAndSign,
  SPINE_PRINCIPAL,
  type AdoptedVerdictStore,
} from "@storytree/orchestrator";

import type { Envelope } from "./envelope.js";

// ---------------------------------------------------------------------------
// The injected shapes
// ---------------------------------------------------------------------------

/**
 * The slice of a capability's node spec this entry reads. Deliberately NARROW — the adapter that
 * builds it owns `loadNodeSpec`, so the compute below stays offline-testable with no disk.
 */
export interface AdoptCapabilitySpec {
  id: string;
  /** The spec's tier. Anything but `capability` is refused (a story has its own entry). */
  tier: "story" | "capability" | "contract";
  title: string;
  /** The owning story id, when the spec declares one (render only). */
  story: string | undefined;
  /**
   * The declared command that exercises this capability — the spine re-runs and OBSERVES this, so an
   * absent one is fail-closed rather than defaulted. This is what a Class C capability (no `proof:`
   * block at all) must have authored before it can be adopted.
   */
  proofCommand: string | undefined;
  /**
   * The repo-relative source paths/globs the spec declares as this capability's own code. The
   * service-history fence matches the branch diff against these; a spec that declares none cannot be
   * fenced and is refused.
   */
  sourcePaths: readonly string[];
  /** The spec file, for honest provenance in the render. */
  file: string;
}

/** The git facts an adopted verdict pins itself to. */
export interface AdoptCapabilityGitState {
  commitSha: string;
  clean: boolean;
}

/** Every seam this entry touches, injected so the whole compute is offline-testable. */
export interface AdoptCapabilityDeps {
  /** Load the capability's spec by id; `null` when no such spec exists in this checkout. */
  loadCapability: (id: string) => AdoptCapabilitySpec | null;
  /**
   * The capability's OWN signed status, folded from the verdict event log (`rollupStatus`, NOT
   * `rollupCapStatus` — coverage by another gate is not a reason to refuse, but an own signed pass
   * is). `null` = genuinely unproven.
   */
  ownStatus: (id: string) => Promise<Status | null>;
  /**
   * The repo-relative paths THIS BRANCH has created or modified against
   * `merge-base(origin/main, HEAD)`. `null` when the base could not be read — which REFUSES, because
   * a fence that fails open is not a fence.
   */
  branchAuthoredPaths: () => readonly string[] | null;
  /** HEAD sha + clean-tree state; `null` when git could not be read. */
  gitState: () => AdoptCapabilityGitState | null;
  /** The spine's out-of-band observation of the declared command (an exit code it watched). */
  observe: (command: string) => Promise<{ code: number | null }>;
  /** The fail-closed approver chain (flag → STORYTREE_SIGNER → git email). */
  resolveApprover: (flag?: string) => { ok: true; signer: string } | { ok: false; error: string };
  /** The live verdict store; `null` offline (a verdict that evaporates greens nothing). */
  store: AdoptedVerdictStore | null;
  /** INJECTED clock — keeps the compute deterministic. */
  now: () => Date;
}

/** Flags this entry accepts. */
export interface AdoptCapabilityOpts {
  /** `--signer <email>`: who is ACCEPTING THE RISK. Feeds the fail-closed chain. */
  signer?: string;
}

// ---------------------------------------------------------------------------
// PURE: the service-history fence
// ---------------------------------------------------------------------------

/**
 * PURE: does `path` match `pattern`? A tiny repo-relative matcher supporting `*` (within one path
 * segment) and `**` (across segments) — the two forms the `proof:` blocks actually use. Everything
 * else is compared literally.
 *
 * Deliberately small and local: the fence needs only to decide whether a branch-touched file is one
 * of the capability's own declared sources, and pulling a glob engine in for that would add a
 * dependency to a compute whose whole value is that it is trivially auditable.
 */
export function pathMatchesDeclared(path: string, pattern: string): boolean {
  // Stryker disable next-line ConditionalExpression,StringLiteral: EQUIVALENT — a pattern carrying no
  // `*` falls through to a regex of `^escapeLiteral(pattern)$`, and `escapeLiteral` escapes every
  // metacharacter a repo-relative path can hold (`.+^${}()|[]\?`); `*` is excluded by this very
  // guard, and `-` and `/` are not special outside a character class. So the general branch accepts
  // exactly the strings `===` accepts, and neither skipping this fast path (the `false` form) nor
  // making `includes` unconditionally true can be observed. The `true` form IS a real change — it
  // would compare a GLOB literally — and it is silenced only as collateral, because the directive
  // works per line and per mutator; the glob cases in the tests still pin that behaviour directly.
  // The same collateral covers `path === pattern` on this line; the literal cases in the tests pin it.
  // (Splitting the comparison onto its own line does not help: an EMPTIED block falls through to the
  // regex too, so the identical equivalence simply reappears as a `BlockStatement` mutant instead.)
  if (!pattern.includes("*")) return path === pattern;
  // Escape every regex metacharacter EXCEPT `*`, then expand `**` → `.*` and a lone `*` → `[^/]*`.
  // Built segment-by-segment rather than through a sentinel character: split on `**` FIRST (it
  // crosses path segments), escape each literal chunk, and expand a lone `*` within a chunk to
  // "anything but a slash". A sentinel would be one more thing that can collide with a real path.
  const escapeLiteral = (s: string): string => s.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
  const expandSingleStars = (s: string): string => s.split("*").map(escapeLiteral).join("[^/]*");
  const expanded = pattern.split("**").map(expandSingleStars).join(".*");
  return new RegExp(`^${expanded}$`).test(path);
}

/**
 * PURE: which of this branch's authored paths are the capability's OWN declared source? A non-empty
 * result means this branch wrote the very code it is being asked to adopt — the self-attestation
 * shape ADR-0465's Consequences names, and the one thing this fence exists to refuse.
 */
export function selfAuthoredSources(
  branchAuthored: readonly string[],
  declared: readonly string[],
): string[] {
  return branchAuthored
    .filter((p) => declared.some((d) => pathMatchesDeclared(p, d)))
    .sort();
}

// ---------------------------------------------------------------------------
// The entry
// ---------------------------------------------------------------------------

/**
 * PURE-by-injection: adopt ONE capability on the owner's recorded risk acceptance (ADR-0465 D2/D4).
 *
 * Every wall below is checked BEFORE the command is ever spawned, so a refusal costs nothing — the
 * expensive step (observing the suite) is last, and the store append is last of all. On ANY refusal
 * NO verdict row is written: proof stays non-authorable (ADR-0020).
 *
 * The order is deliberate — cheapest and most-refusing first:
 *   1. an id, and a capability spec that exists and is actually a capability;
 *   2. it does not ALREADY hold its own signed pass (re-stamping is unrecoverable, see below);
 *   3. it declares a command for the spine to observe (the Class C wall);
 *   4. THIS BRANCH did not author its source (the service-history fence);
 *   5. an approver resolves (who is accepting the risk);
 *   6. the live store is present;
 *   7. HEAD is readable and CLEAN;
 *   8. only then: observe the command, and sign on green.
 */
export async function runAdoptCapability(
  capabilityId: string | undefined,
  opts: AdoptCapabilityOpts,
  deps: AdoptCapabilityDeps,
): Promise<Envelope> {
  if (capabilityId === undefined || capabilityId.trim().length === 0) {
    return {
      ok: false,
      body: "adopt capability needs a capability id: storytree adopt capability <capability-id> --pg",
      next: ["storytree tree", "storytree adopt capability --help"],
    };
  }
  const id = capabilityId.trim();

  // 1. The spec must exist, and must be a CAPABILITY. A story has its own (status-guarded) entry and
  //    must not be reachable through this one — that would be the `mapped`-only guard walked around
  //    at a different grain, which ADR-0465 D4 forbids in the same breath that it asks for this verb.
  const spec = deps.loadCapability(id);
  if (spec === null) {
    return {
      ok: false,
      body: `no capability "${id}" (looked for a stories/*/${id}.md spec, or its frontmatter did not load).`,
      next: ["storytree tree", `storytree library artifact ${id}`],
    };
  }
  if (spec.tier !== "capability") {
    const where =
      spec.tier === "story"
        ? `"${id}" is a STORY. Story-grain adoption is a different decision with a different evidence basis (it enters the proving process and flips mapped → proposed):\n  storytree adopt ${id} --pg`
        : `"${id}" is a ${spec.tier}, not a capability. A contract is proven by the capability that folds it, never adopted on its own.`;
    return { ok: false, body: `${where}`, next: [`storytree tree ${spec.story ?? ""}`.trim()] };
  }

  // 2. NEVER STAMP OVER AN OWN SIGNED PASS. The verdict fold is "last event wins", so appending a new
  //    row for an already-green capability can only lose information, and the loss is not recoverable
  //    by re-running. A capability that already holds its own pass is not this decision's population:
  //    ADR-0465 addresses the caps holding NEITHER an own verdict NOR a covering gate.
  const own = await deps.ownStatus(id);
  if (own === "healthy") {
    return {
      ok: false,
      body:
        `capability "${id}" ALREADY holds its own signed pass — there is nothing to adopt.\n` +
        "Appending another verdict could only overwrite it (the fold is last-event-wins), so this refuses\n" +
        "rather than trading a driven pass for an adopted one.",
      next: [`storytree tree ${spec.story ?? ""}`.trim()],
    };
  }
  if (own === "unhealthy") {
    return {
      ok: false,
      body:
        `capability "${id}" holds a signed FAIL — a red is not adopted, it is fixed.\n` +
        "Adoption records that work already serving is accepted as-is; it can never paint over an\n" +
        "observed regression (ADR-0465 D2 rests on a passing command, and this one is not passing).",
      next: [`storytree tree ${spec.story ?? ""}`.trim()],
    };
  }

  // 3. THE COMMAND WALL. `adopted` means the spine OBSERVED a declared command green — so a capability
  //    that declares no command has nothing to observe and cannot be adopted, only authored. This is
  //    where ADR-0465 D1's third finding lands in code: the 58 capabilities carrying no `proof:` block
  //    refuse here, for free, naming exactly what is missing.
  const command = spec.proofCommand?.trim();
  if (command === undefined || command.length === 0) {
    return {
      ok: false,
      body:
        `capability "${id}" declares no proof command — there is nothing for the spine to observe.\n` +
        `Adoption is observe-and-sign, not a flip: author a \`proof:\` block in ${spec.file} naming the\n` +
        "command that already exercises this capability, then adopt it. If NO command exercises it, that\n" +
        "is the finding — the capability is either unbuilt (prove it strictly) or not capability-shaped\n" +
        "(route it to story-author), and neither is adopted.",
      next: [`storytree library artifact ${id}`, `storytree adopt capability ${id} --pg`],
    };
  }

  // 4. THE SERVICE-HISTORY FENCE (ADR-0465 Consequences). Adoption rests on work that is already built
  //    and already serving. If THIS branch authored the capability's own source, the "long
  //    complaint-free service history" the owner is accepting risk against does not exist yet, and the
  //    adoption would be the author vouching for their own fresh work.
  const declared = spec.sourcePaths.filter((p) => p.trim().length > 0);
  if (declared.length === 0) {
    return {
      ok: false,
      body:
        `capability "${id}" declares no source paths, so its service history cannot be checked.\n` +
        "Adoption is fenced on the capability's code PRE-DATING this branch (ADR-0465 — a capability\n" +
        `adopted in the same landing that authored it is self-attestation). Declare the source this\n` +
        `capability owns in ${spec.file}, then adopt it.`,
      next: [`storytree library artifact ${id}`],
    };
  }
  const branchAuthored = deps.branchAuthoredPaths();
  if (branchAuthored === null) {
    return {
      ok: false,
      body:
        "could not read what this branch authored against origin/main, so the service-history fence\n" +
        "cannot be applied — and it fails CLOSED, because a fence that fails open is not a fence.\n" +
        "Fetch the base and retry: git fetch origin main",
      next: ["git fetch origin main", `storytree adopt capability ${id} --pg`],
    };
  }
  const selfAuthored = selfAuthoredSources(branchAuthored, declared);
  if (selfAuthored.length > 0) {
    return {
      ok: false,
      body:
        `THIS BRANCH authored the source of "${id}", so it cannot be adopted here (ADR-0465).\n` +
        `  ${selfAuthored.join("\n  ")}\n` +
        "Adoption records that work ALREADY built and ALREADY serving is accepted on the owner's risk\n" +
        "acceptance. A capability adopted in the same landing that authored it is self-attestation\n" +
        "wearing the brownfield's clothes — freshly written work earns a driven red→green instead.",
      next: [`storytree node build ${id} --real --store pg`],
    };
  }

  // 5. The adoption decision is a HUMAN act (ADR-0097 d.4, ADR-0465 D2) — resolve who is accepting the
  //    risk BEFORE any spend, so a blank approver refuses without running the suite.
  const approver = deps.resolveApprover(opts.signer);
  if (!approver.ok) {
    return {
      ok: false,
      body:
        `${approver.error}\n` +
        "Adoption accepts RISK on work this system did not drive, so it must be attributable to a real\n" +
        "person: --signer <email> (or set git user.email / STORYTREE_SIGNER).",
      next: [`storytree adopt capability ${id} --signer <email> --pg`],
    };
  }

  // 6. A signed verdict must PERSIST — one that evaporates greens nothing.
  if (deps.store === null) {
    return {
      ok: false,
      body: "adopt capability signs an `adopted` verdict to the live store (events.verdict) — run with the DB up.",
      next: ["pnpm db:up", `storytree adopt capability ${id} --pg`],
    };
  }

  // 7. The verdict pins a commit, so the tree must be readable AND clean.
  const git = deps.gitState();
  if (git === null) {
    return {
      ok: false,
      body: "could not read git state (HEAD / clean tree) — an adopted verdict pins a real commit. Run inside the repo.",
      next: [],
    };
  }
  if (!git.clean) {
    return {
      ok: false,
      body:
        `adopt from a clean committed HEAD — the tree at ${git.commitSha.slice(0, 7)} has uncommitted edits,\n` +
        "and an adopted verdict pins the commit it observed.",
      next: ["git status", `storytree adopt capability ${id} --pg`],
    };
  }

  // 8. OBSERVE AND SIGN. The synthetic obligation carries the CAPABILITY's own id, so the verdict's
  //    `unitId` is the capability and `rollupStatus` folds it exactly like any other own verdict — the
  //    plant greens through a signed row, never through authored paint. It carries no criterion
  //    binding, so `observeAndSign` routes it down the BROWNFIELD class: `approvedBy` is REQUIRED and
  //    the signer stays the spine principal (the machine that watched the exit code).
  const runId = `adopt-capability:${deps.now().toISOString()}`;
  const signed = await observeAndSign({
    gate: { id, kind: "observe", proofCommand: command },
    gitState: async () => ({ commitSha: git.commitSha, clean: git.clean }),
    observe: deps.observe,
    approverInputs: { flag: approver.signer },
    store: deps.store,
    runId,
    now: () => deps.now().toISOString(),
  });

  if (!signed.ok) {
    return {
      ok: false,
      body:
        `capability "${id}" was NOT adopted — ${signed.reason}\n` +
        "No verdict was signed. Adoption rests on the declared command being observed GREEN at a clean\n" +
        "HEAD; where it is not, the honest answer is that this capability is not in the adoptable\n" +
        "population, not that the bar should move.",
      next: [`${command}`, `storytree adopt capability ${id} --pg`],
    };
  }

  return {
    ok: true,
    body: [
      `Adopted "${id}" — an \`adopted\` verdict is signed and persisted.`,
      `  title:      ${spec.title}`,
      ...(spec.story !== undefined ? [`  story:      ${spec.story}`] : []),
      `  observed:   \`${command}\` exited 0`,
      `  signer:     ${SPINE_PRINCIPAL} (the machine that witnessed the green)`,
      `  approvedBy: ${approver.signer} (who ACCEPTED THE RISK — not the signer, ADR-0465 D2)`,
      `  commit:     ${git.commitSha.slice(0, 7)}`,
      "",
      "What this verdict claims, stated exactly: the declared command was observed green at a clean",
      "committed HEAD, and the owner accepts that a passing suite plus a complaint-free service history",
      "is sufficient basis. It is NOT a driven red→green, and no surface may render it as one — the two",
      "differ in KIND, not in rank (ADR-0465 D7): a driven pass is a forward-looking fence over one",
      "behaviour its author thought to check, while time in service is evidence over every path real use",
      "actually took. What service history cannot speak to is the path nobody took.",
      "",
      "Green until notified otherwise (ADR-0465 D5): if this shows up wrong, it is withdrawn by a",
      "recorded act naming who reported the fault — the adoption stays visible in history, never erased.",
    ].join("\n"),
    next: [`storytree tree ${spec.story ?? ""}`.trim(), `storytree library artifact ${id}`],
  };
}
