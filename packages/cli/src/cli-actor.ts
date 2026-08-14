// Back-compat shim after the arc extraction (`arc-tier-extraction-arc`): the write STAMP moved to
// `@storytree/drive`, beside `envelope.ts` and `secrets.ts` — the same ADR-0112 reach-move, for the
// same reason. `@storytree/arc` now holds three write verbs (`arc`, `arc increment`, `question`) and
// must stamp them identically to the ones still in this package; it cannot import `@storytree/cli`,
// so the stamp had to move DOWN to the package both already depend on rather than be copied.
//
// Re-exported here so every cli file that imports `./cli-actor.js` is unchanged — which also keeps
// the ATTRIBUTION FENCE (`write-attribution.ts`) reading the same call-site text it always did.
export {
  CLI_ACTOR_PREFIX,
  cliActorFor,
  branchOfActor,
  currentGitBranch,
  defaultCliActor,
} from "@storytree/drive";
