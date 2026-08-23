// @storytree/orchestrator — the deterministic spine (ADR-0005/0020). The spine OWNS control flow
// (runSequence / runLoop) and the red-green honesty floor (the phase machine); the leaf only judges.

export type { StepFn, SequenceRun, LoopArgs, LoopRun } from "./sequence.js";
export { runSequence, runLoop } from "./sequence.js";

export type {
  ExpectedRed,
  Phase,
  RedKindBasis,
  TestObservation,
  PhaseTransition,
  WriteScope,
  PathWriteScopeConfig,
  TestExecutor,
} from "./phase-machine.js";
export {
  nextPhase,
  advancePhase,
  PathWriteScope,
  globMatch,
  RecordingTestExecutor,
} from "./phase-machine.js";

export type {
  ShellRunResult,
  ShellCommand,
  ShellTestResolver,
} from "./shell-test-executor.js";
export {
  ShellTestExecutor,
  UNVETTED_GREEN_NOTE,
  unvettedGreenNote,
  defaultClassifyKind,
  nodeEvalExecutor,
  runShellCommand,
  shellObserveCommand,
  scrubbedChildEnv,
  isScrubbedEnvKey,
} from "./shell-test-executor.js";

export type {
  WriteToolSpec,
  WriteViolation,
  WriteScopedToolExecutorArgs,
} from "./write-scoped-executor.js";
export { WriteScopedToolExecutor } from "./write-scoped-executor.js";

export type {
  BackstopOutcome,
  TreeState,
  PhasePrompts,
  ProveSpec,
  ProveResult,
} from "./prove-it-gate.js";
export { proveUnit, gitTreeState } from "./prove-it-gate.js";

export type { OwnedLoopAuthorArgs } from "./owned-loop-author.js";
export { OwnedLoopAuthor } from "./owned-loop-author.js";

export type { NodeSpec } from "./node-spec.js";
export { loadNodeSpec, findNodeSpecFile, mapProofMode } from "./node-spec.js";
// Re-exported from the library organism (ADR-0068 step 3) so the studio dev server — which
// lazy-imports ONLY the orchestrator (devApi.ts's raw-TS trap) — resolves the uat_witness default
// through the same single helper the story-build gate uses (ADR-0040).
export { effectiveUatWitness, type UatWitness } from "@storytree/library";
// ADR-0106: the per-test witness RESOLUTION — re-exported so the studio dev server (which lazy-imports
// ONLY the orchestrator) resolves the binary `human`|`machine` witness through the SAME classifier the
// adopt pass uses, so the owner surface's binary can never fork from the rule.
export {
  resolveWitness,
  resolvedWitnessOf,
  unresolvedUatLegs,
  isUnresolvedWitness,
  type ResolvedWitnessKind,
  type WitnessResolution,
} from "@storytree/library";

export type { NodeBuildConfig, RealProofConfig } from "./test-command-registry.js";
export {
  NODE_BUILD_REGISTRY,
  lookupNodeBuildConfig,
  registeredNodeIds,
  realBuildableNodeIds,
} from "./test-command-registry.js";

// The spec-borne proof-config shape (ADR-0057 keystone): the zod schema + parser a node's own
// `proof:` block validates through (the loader uses it; tests assert it directly).
export { NodeBuildConfigSchema, parseNodeBuildConfig } from "./proof-config.js";

export type {
  DryRunResolveOptions,
  LiveSmokeResolveOptions,
  RealResolveOptions,
  ResolveOptions,
  ResolveResult,
  LeafPhasePrompts,
} from "./resolve-prove-spec.js";
export {
  resolveProveSpec,
  resolveBuildConfig,
  realProofCommand,
  assemblePrompts,
  liveSmokePrompts,
  realPrompts,
  feedbackCommandsFor,
  dryRunModel,
  scriptedWriterModel,
  DRY_RUN_TEST_REL,
  DRY_RUN_IMPL_REL,
} from "./resolve-prove-spec.js";

export type {
  AddDepsGroup,
  BuildWorktree,
  CommitAuthoredResult,
  CommitScope,
  CreateBuildWorktreeOptions,
  PromotionResult,
} from "./build-worktree.js";
export {
  createBuildWorktree,
  commitAuthored,
  promoteRealPass,
  runRegressionSuite,
  runWorktreeTypecheck,
  platformShellCommand,
} from "./build-worktree.js";

export type {
  StoryNodeOutcome,
  StoryNodeBuilder,
  StoryBuildArgs,
  StoryBuildRun,
  TopoResult,
  StoryBuildMode,
  StoryGoGreen,
} from "./story-build.js";
export {
  runStoryBuild,
  topoOrderStoryNodes,
  storyDriveOrder,
  isStoryBuildable,
  storyGoGreen,
} from "./story-build.js";

// ── The proof machinery (ADR-0068 step 1): the farmer organism's RULER — the compute that
// constructs/signs/hashes/classifies/derives verdict-DATA, moved out of @storytree/core. The DATA
// SHAPES it reads/returns live in @storytree/proof-protocol; this is the COMPUTE half. ──────────
// The ONE proof-command classifier (`custom-proof-command-red-accounting` on `parallel-red-green-arc`):
// what a declared `real.proofCommand` IS, and whether the ADR-0211 assert-oracle can measure it. The
// arc's standing instruction is that ONE classifier serves every finding over this population — never
// a second one, or they can disagree about the same command.
export type { ProofRoute, ProofRouteBasis, ClassifyProofRouteOpts } from "./proof/proof-route.js";
export {
  classifyProofRoute,
  namesTestFile,
  withOracleGuard,
  withOracleGuardEnv,
} from "./proof/proof-route.js";
export type { SignerInputs, SignerResult } from "./proof/signer.js";
export { resolveSigner } from "./proof/signer.js";
export { resolveSignerFromEnv } from "./proof/signer-env.js";
export { isProvenStatus } from "./proof/proof-status.js";
export { verdictLine } from "./proof/verdict-line.js";
export { normalizeSpan, hashSpan, isDescribed, classifyDrift } from "./proof/anchor-compute.js";
export { workEvent, rollupStatus } from "./proof/rollup.js";
export type { RollupEvent } from "./proof/rollup.js";
// The per-slice token-usage event builder (accounting, never proof — the sibling stream to
// events.verdict; the signed Verdict deliberately carries no runtime cost).
export { usageEvent } from "./proof/usage-event.js";
export { rollupParitySuite } from "./proof/rollup-parity.js";
export { deriveAttestations } from "./proof/attestations.js";
// The per-test UAT proof compute (ADR-0082): the sign-time trust guard + the read-time AND-roll-up
// that greens a story's own UAT when all its per-test verdicts pass. DATA shapes are the contract's;
// the per-test DATA + parser live in the library organism (`uat-test-criteria.ts`, ADR-0044).
export type { UatProofCheck, UatProofResult } from "./proof/uat-proof.js";
export {
  checkUatProof,
  rollupCriterionStatus,
  rollupStoryUat,
  rollupStoryGreen,
  rollupCapStatus,
  gateStoryGreenOnOpenQuestions,
} from "./proof/uat-proof.js";
// ADR-0085 (resolving ADR-0083 Fork B): the OBSERVE-AND-SIGN compute — an `observe` obligation earns
// an `adopted` machine verdict when the spine observes its declared command green at a clean
// committed HEAD (no prior red; job 2 supplied by author review). ADR-0408 splits the spec into its
// two structural classes: a MACHINE UAT LEG (carries a criterion binding, no `approvedBy`) and a
// BROWNFIELD OBSERVE GATE (no binding, `approvedBy` required and fail-closed).
export type {
  ObserveAndSignSpec,
  ObserveMachineLegSpec,
  ObserveBrownfieldGateSpec,
  ObserveAndSignResult,
  ObserveGitState,
  ObserveOutcome,
  AdoptedVerdictStore,
} from "./proof/observe-and-sign.js";
export { observeAndSign } from "./proof/observe-and-sign.js";
// ADR-0417 D2/D3: the shared CRITERION-SIGNING PRIMITIVE both `storytree uat run` and `storytree
// adopt` call, so machine acceptance proof is reachable without invoking a command named *adopt*.
// One implementation, so the honesty fences (exact binding, no partial verdict set, no approver)
// cannot drift between the two surfaces.
export type {
  MachineLegOutcome,
  MachineLegResolution,
  MachineLegReport,
  SignMachineCriteriaArgs,
  SignMachineCriteriaDeps,
  SignMachineCriteriaResult,
} from "./proof/sign-machine-criteria.js";
export {
  resolveMachineLeg,
  resolveMachineLegs,
  signMachineCriteria,
} from "./proof/sign-machine-criteria.js";
// ADR-0097: the named spine principal that SIGNS an `adopted` verdict (the machine witness; the human
// who pressed Adopt is the verdict's `approvedBy`).
export { SPINE_PRINCIPAL } from "./proof/spine-principal.js";
// ADR-0097 Layer 2: the pure adoption-proposal classifier. Two halves, both offline (no store/git/clock):
// the STRUCTURAL covers-diff (`classifyAdoption`, Fork 1) — a story's `(covers:)` declarations vs its
// capability set (covered vs uncovered + the extensible pocket slot) — and the JUDGMENT half
// (`assembleProposal`, ADR-0098 d.1): stamps each uncovered pocket's observe/R1/R2 class from injected
// agent readings, emits recommend-only `ProposedGate` stanzas (`renderProposedGate` round-trips them
// through the real reliability-gate parser), and sweeps the surfaced forks. An un-read pocket stays
// `unclassified` (fail-closed).
export type {
  AdoptionProposal,
  AdoptionProposalSpec,
  AdoptionProposalEnriched,
  AssembleProposalSpec,
  CapAdoption,
  CoveringGate,
  ClassifierGate,
  PocketClass,
  PocketReading,
  ProposedGate,
  ProposedGateKind,
} from "./proof/adoption-proposal.js";
export {
  classifyAdoption,
  assembleProposal,
  renderProposedGate,
  parsePocketReadings,
} from "./proof/adoption-proposal.js";
// ADR-0020 coverage-honesty follow-on: the pure contract→test coverage classifier — maps each
// declared `## Contracts` behaviour to an observed test by the naming convention, flagging the
// uncovered (the gap a signed `--real` green leaves open: it attests ONE authored test, ADR-0020 §3).
// Mirrors classifyAdoption one tier DOWN (capability→gate ⇒ contract→test). Offline, no store/git/clock.
// The INVERSE direction (test⇒contract) rides the same module: `classifyBehaviourClaims` answers
// "which declared contract claims this asserted behaviour?", the question an ADR-0294 D2 deletion has
// to answer and which contract-coverage structurally cannot.
export type {
  AssertedBehaviour,
  BehaviourClaimReport,
  BehaviourClaimSpec,
  ClaimedBehaviour,
  ContractCoverage,
  ContractCoverageReport,
  ContractCoverageSpec,
  ObservedTest,
  ReadTitle,
  TestSurfaceRead,
} from "./proof/contract-coverage.js";
export {
  classifyBehaviourClaims,
  classifyContractCoverage,
  classifyDeclaredCoverage,
  extractTestNames,
  extractVouchingTestNames,
  analyzeObservedTests,
  readTestCallTitle,
  readTestSurface,
  testNameCoversContract,
} from "./proof/contract-coverage.js";
// ADR-0098 Layer 3 (U4): the pre-build batch decision-sweep — the deterministic owner-fork-bar
// classifier (the d.5 escalate-ownership-not-uncertainty discriminator) + the partition + the
// fail-closed halt gate the build-tests `--real` drive consults before any spend. Pure, offline; the
// candidate forks are agent analysis (the orchestrator session's pocket read), this is the ruler.
export type {
  ForkSignals,
  DecisionFork,
  ForkDisposition,
  ClassifiedFork,
  DecisionSweepSpec,
  DecisionSweep,
} from "./proof/decision-sweep.js";
export {
  classifyFork,
  sweepDecisions,
  blockedHaltReport,
  resolvedBriefContext,
} from "./proof/decision-sweep.js";
export type { SourceRef, SourceDriftFlag } from "./proof/source-drift.js";
export { classifySourceDrift } from "./proof/source-drift.js";
