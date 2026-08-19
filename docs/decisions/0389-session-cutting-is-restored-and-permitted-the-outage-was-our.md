---
status: accepted
decided: 2026-08-19
arc: session-cutting-outage-arc
---
# ADR-0389: Session cutting is restored and permitted: the outage was our own worktree-pool reuse, not vendor session creation

## Status

accepted (2026-08-19) — decided/directed by the owner in conversation on 2026-08-19. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

From 2026-08-13, any desktop session started with "create a fresh worktree" ticked failed to start. Chips always request a worktree, so the chip dispatch route — the factory's way of fanning work into fresh sessions — was entirely dead. On 2026-08-14 the owner froze chipping as a dispatch route: a chipped follow-up reached nobody while reading as handled, so follow-ups had to be parked as arc increments or built in place.

The failure was attributed to a vendor bug (anthropics/claude-code#86574) on the strength of a repro in a throwaway one-commit repo with no `.claude/`, no hooks and none of our history. That control was better designed than it was later described — it ran on the same app version, minutes apart, in the same app session, varying only the repo. But it varied ONLY the repo, and it was n=1 per cell on one version. It could never rule out anything machine-level, and it was never re-run after the failure shape changed.

Three diagnoses were retracted during the original investigation. Two further readings are falsified here and must not be re-derived:

- **"`LocalSessions.start` receives an empty payload."** That line is a hardcoded literal carrying no fields for EVERY start, healthy or broken. An empty payload was never observable there.
- **"Nothing is created."** The failing start of 2026-08-19 created branch `claude/youthful-wing-54dabe` and re-leased pooled slot `inspiring-keller-79cd2e`. A real failure now satisfies "check that nothing was created".

A four-lane investigation on 2026-08-19 cleared our guardrails on their own evidence rather than by construction — the user-level `hooks` key is an empty array, all 144 `permissions.deny` rules are path-scoped inside `/c/code/storytree/` and gate a running agent's tool calls, and no project hook can have run because the CLI binary is never spawned on a failed start. The dirty primary checkout is a bystander: its `could not fast-forward local main` error fires on SUCCESSFUL starts too.

## Decision

**D1. Session cutting is PERMITTED across all new sessions.** The 2026-08-14 freeze on chipping as a dispatch route is withdrawn. The owner confirmed a fresh session cut independently on 2026-08-19.

**D2. The cause is ours, and it is named.** When the desktop REUSES a pooled worktree slot it scrubs it with `git clean -ffdx` over a `.claude/**` pathspec and awaits the result. pnpm materialises this workspace's dev-dependency cycle — `library` → `proof-protocol` → `library`, the back-edge existing only for one parity test — as Windows JUNCTIONS, which git traverses as ordinary directories. The clean therefore recurses unboundedly: 154,373 `Function not implemented` warnings at ever-deeper paths, and a live capture of the process spawned by `claude.exe` running 29.5 minutes at ~85% of a core. The awaited clean never returns, so the start never reaches `[rebindWorktree]`, no CLI binary is spawned, and the renderer holds a session id the manager reports "not found after session load" 65 times over eight minutes.

**D3. What restored it was emptying the reuse pool.** Draining the farm 75 → 15 routed starts down the create-fresh path, which invokes no clean at all. Measured 2026-08-19 21:29 — `No reusable worktree (5/5 candidates checked)` → `Created worktree` → `Starting local session`, four seconds end to end, **with the junction cycle still fully in place**. The cycle is therefore a necessary condition for the hang, not for the fix.

**D4. The vendor attribution is withdrawn for this failure.** A genuine upstream residue remains and is worth filing: an unbounded `git clean -ffdx` awaited on the session-start path breaks any pnpm workspace with a dev-dependency cycle on Windows, and the app stores its worktrees inside the very directory that pathspec covers. But "desktop session creation is broken" is no longer our finding.

**D5. What does NOT change.** The ADR-0288 worth-a-session bar still sits on the minting side; declining a follow-up is still free and carries no durable record; silence is still forbidden. Restoring the route is not a licence to chip everything — "the click is consent, not selection" stands.

## Consequences

- The factory can parallelise through fresh sessions again, and follow-ups have a working dispatch route rather than only a parked home.
- **The restoration currently rests on a hand drain.** The population was back to 24 within the same session. Until `session-cutting-outage-arc-inc-03` lands, a refilled pool returns the reuse path and with it the outage. This is the named residual risk of accepting D1 now.
- The junction cycle remains a latent hazard until `-inc-02`: whenever that clean does run, it cannot terminate. Measured 58 s with the single edge removed versus non-terminating with it.
- Standing guidance (`CLAUDE.md`, the `session-orchestrator` artifact and its projections, agent memory) still describes the outage as live until `-inc-04`, and the mechanical check is actively misleading until `-inc-05`.
- Cost accepted knowingly: six days were spent on a misattribution because the control varied only the repo, and because a census instrument keyed on a `worktree=true` flag that a successful 2026-08-15 start never emitted — so "zero since 08-13" could not distinguish a dead capability from an unstamped one. Both lessons are carried by `-inc-05`.
- Log rotation destroyed the Aug 3–9 file mid-investigation, so healthy-era worktree starts are no longer recoverable from disk. Future instruments must not assume retained history.

## References

- `session-cutting-outage-arc` — increments `-inc-02` (remove the cycle), `-inc-03` (self-limiting population), `-inc-04` (standing guidance), `-inc-05` (the mechanical check).
- `scripts/check-worktree-session-creation.mjs` — the mechanical check whose tell this ADR retires.
- `packages/proof-protocol/package.json`, `packages/proof-protocol/src/parity.test.ts` — the dev-dependency back-edge that closes the cycle.
- anthropics/claude-code#86574 — the upstream issue; re-scope to the awaited-unbounded-clean residue in D4.
- ADR-0110 (owner direction is ratification), ADR-0139 (correct overtaken prose in place), ADR-0288 (the worth-a-session bar, unchanged by D5), ADR-0335 (parking an increment reopens an arc).
