---
status: superseded
decided: 2026-07-14
---
# ADR-0194: A red hosted-studio deploy must be loud: the check:deploy-health gate signal

## Status

superseded by [ADR-0311](0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md)
(2026-08-05). Deploy diagnostics remain available, but `check:deploy-health` is no longer a
standalone merge obligation.

Originally accepted (2026-07-14) — decided/directed by the owner on 2026-07-14: the owner routed
`friction-deploy-studio-red-is-silent` → tool (with owner visibility) and directed a session to
"design + land the smallest honest post-merge deploy-health signal", naming the
gate-check / health-banner family. Design-time alignment IS the ratification (ADR-0110); no second
end-of-flow ask. This ADR records the chosen mechanism.

## Context

**The incident (the friction item's evidence).** `deploy-studio.yml` — the post-merge continuous
deployment of the member-facing hosted studio (ADR-0042/0046/0061) — failed on every main run for
~2 days: 11+ consecutive red runs from 2026-07-11T15:15 to 2026-07-13T13:04 (root cause `844efe60`,
PR #688's node-pty dependency breaking the Docker image's pnpm install on gyp/Python). Nobody was
signalled. The hosted studio silently served a 2-day-stale bundle across ~15 merged PRs until the
owner noticed by hand — detection at the most expensive tripwire (owner eyeballs, post-merge),
exactly the failure class ADR-0192's incident named.

**The structural gap.** The deploy is DELIBERATELY post-merge and never a PR check ("a deploy
failure never blocks a merge" — the workflow's own header, and the right call: an infra failure
must not block unrelated landings). But that correctness choice left the run's conclusion with NO
reader: PR CI is green, GitHub's failure e-mails fired 11 times unseen, and no session surface
watches post-merge workflows. The merge ceremony's "watch CI" discipline ends at the PR's own
checks — the deploy fires after.

**Why the served studio can't self-report.** The tempting fix — a staleness banner in the studio
itself — is structurally unsound: the container has no `.git` (the `/api/health` code stamp is
absent in-container by design, `container-image`), it holds no GitHub credentials to ask whether
main moved, and above all any in-app signal ships THROUGH the very pipeline whose failure it would
report — when the deploy is red, the banner code is exactly what didn't deploy.

## Decision

1. **The signal surface is the local gate tail** — the one surface every session already must read
   (`never-bypass-the-gate`). A new best-effort `check:deploy-health` runs at the end of
   `pnpm gate`, in the established ADR-0055 posture (`check:agents-sync` precedent): **WARN loudly,
   never block, always exit 0**; SKIP in one quiet line when `gh` / auth / network are absent
   (offline gates unaffected); not wired into CI (CI runs pre-merge — the wrong side of the gap).

   **Correction (2026-07-28 — [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)
   pass): the CITED PRECEDENT moved; this decision did not.** `check:deploy-health` is unchanged and
   still WARNs loudly, never blocks, and always exits 0 — that is this ADR's decision and it stands. But
   `check:agents-sync`, named here as the posture being reused, was bounded at a drain ceiling on
   2026-07-28 (`packages/cli/src/sync-drain.ts`) and now sets a non-zero exit on breach, so ADR-0055 is
   no longer an example of "always exit 0". The half this ADR actually borrowed is intact and still
   exemplified there: a best-effort gate-TAIL step that WARNs loudly and SKIPs in one quiet line when
   its inputs are absent. Whether this check should likewise gain a ceiling is a separate question under
   [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) D3, decided against
   this check's own output and remedy — not inherited from the precedent, and not settled here. (Noted
   because a session calibrating from ADR-0055 would otherwise find a redding check and read this ADR as
   either stale or violated.)
2. **Mechanism.** The check shells
   `gh run list --workflow deploy-studio.yml --branch main` (bounded timeout) and hands the
   newest-first run list to a **pure classifier** — the provable contract,
   `packages/cli/src/deploy-health.ts` — which returns `ok` / `red` / `unknown` with the red
   streak length, red-since timestamp, newest red run URL, and last green deploy. A `red` verdict
   formats a LOUD multi-line WARN naming the consequence (the hosted studio is serving the image
   from the last green deploy) and the forensics pointer (`gh run view <id> --log-failed`). The
   gh-shelling wrapper is un-asserted glue (ADR-0158); the classifier is the red→green unit.
3. **Home.** The unit lives under `studio-cloud` (the story whose outcome the silence broke), new
   capability `deploy-health-signal`; its proof-bound source is hosted in `packages/cli` (where
   every gate check lives), so the hosting pair is declared consumer-side on `studio-cloud`
   (`depends_on` + `artifact_edges` += `cli`, ADR-0192 rule 5; `studio-cloud` is on the
   `hostedStories` register, so packages-forward rule 6 admits it).

**Rejected alternatives.** (a) *Make deploy-studio a PR check* — inverts the deliberate
never-blocks-a-merge posture, and the failing run doesn't exist until after merge. (b) *A studio
/api/health staleness banner* — the stale server is the one party that cannot know it is stale
(no git, no GitHub creds), and the banner would deploy through the broken pipe it reports
(named future hardening only if a trustworthy external staleness oracle appears). (c) *GitHub
notification/issue automation* — the e-mails already fired 11 times unseen; an auto-issue is one
more unwatched surface. (d) *Blocking the gate on a red deploy* — couples every unrelated landing
to infra state and punishes offline sessions; WARN-only is the honest posture for a best-effort
network probe.

## Consequences

- **Good.** A red post-merge deploy becomes loud to the NEXT session (and the owner's own gate
  runs) without anyone remembering to look — the friction item's exact ask. The signal is honest
  about ignorance: offline/no-gh gates say "unverified", never "healthy". Zero new
  infrastructure; the mechanism is one pure function plus ~a page of glue in the existing
  check pattern.
- **Cost / residual.** Latency is "until the next gate run", not real-time — accepted as the
  smallest honest signal (sessions gate constantly; a pushed member-facing regression typically
  precedes another session within hours). Each local gate spends one bounded `gh` call. A red
  streak older than the `gh run list` page (20 runs) reports a truncated streak length — the
  verdict itself stays correct.
- **Reversibility.** One script + one classifier + one gate-tail entry; deleting them restores the
  status quo.

## References

- Library friction item `friction-deploy-studio-red-is-silent` (routed → tool, 2026-07-14 board
  drain) — the incident evidence.
- `.github/workflows/deploy-studio.yml` (ADR-0046/0061) — the watched workflow.
- ADR-0055 (`check:agents-sync`) — the best-effort WARN-only gate-tail posture this reuses (as it stood
  at this decision; that check gained a drain ceiling on 2026-07-28 — see the correction under D1).
- ADR-0042 — the member-facing hosted studio whose staleness is the blast radius.
- ADR-0192 — hosted-story landlord rule + `hostedStories` register (governs the unit's home).
- `stories/studio-cloud/deploy-health-signal.md` — the capability this ADR decides.
