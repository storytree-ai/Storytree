// Back-compat shim after the arc extraction (`arc-tier-extraction-arc`, ADR-0369): the write STAMP
// moved to `@storytree/drive`, beside `envelope.ts` and `secrets.ts` — the same ADR-0112 reach-move,
// for the same reason. `@storytree/arc` now holds three write verbs (`arc`, `arc increment`,
// `question`) and must stamp them identically to the ones still in this package; it cannot import
// `@storytree/cli`, so the stamp had to move DOWN to the package both already depend on rather than
// be copied.
//
// THE BRANCH-LIVENESS HALF (ADR-0371) MOVED WITH IT, and that is deliberate rather than incidental:
// it landed on `main` in this same file while the extraction was in flight, and it is the same
// question this module already answered (`currentGitBranch`) asked over a longer horizon — is the
// session that wrote this still working? Splitting the two halves across packages would have put one
// git-derived identity answer in each, which is the drift the file exists to prevent. Its consumers
// (`check-graduation-worklist.ts`, `commands.ts`) are unchanged; they read it through this shim.
//
// Re-exported here so every cli file that imports `./cli-actor.js` is unchanged — which also keeps
// the ATTRIBUTION FENCE (`write-attribution.ts`) reading the same call-site text it always did.
export {
  CLI_ACTOR_PREFIX,
  IN_FLIGHT_WINDOW_DAYS,
  cliActorFor,
  branchOfActor,
  currentGitBranch,
  defaultCliActor,
  selectInFlightBranches,
  inFlightBranches,
  type BranchRef,
} from "@storytree/drive";
