# Inviting an explorer — the owner's ceremony (ADR-0207 D2/D4)

The arc's end state is *"no owner hand-holding beyond sending the invite and the install one-liner."*
This is that invite: **three grants, then one message.** It exists as its own page because the parts
live in three different places (a GitHub org, the studio Members panel, this repo), and the failure
mode of forgetting one is silent — the dev installs fine and only discovers the gap later.

An explorer is **read-only by design**: they can explore the tree, the library and the decision log,
and they cannot write. Growing or mapping a tree is explicitly out of scope for v1.

## The two access grants map 1:1 onto what `doctor` probes

This is the useful property to hold on to: each grant you make is something the dev's own
`storytree doctor` independently verifies, and a missing grant escalates back to you *by name*.

| Grant | What it unlocks | `doctor` probe | If you forget it |
|---|---|---|---|
| **GitHub org Read** | The read-only checkout — code, stories, the decision log | `repo-fetchable` | The clone fails during install |
| **IAP / Members access** | The live read — verdicts, claims, presence (D4) | `hosted-read` | Install succeeds, then the live read is refused |

The second one is the trap. The dev's environment looks entirely healthy — everything installs,
everything runs — and only the live data is missing. `doctor` catches it and produces an escalation
naming the IAP grant specifically, so the dev pastes you something actionable instead of "it doesn't
work."

## 1. GitHub Read (the code)

Invite the dev to the **`storytree-ai`** organization with the **Read** role. A free org grants
read-only; this is why the repo moved off a personal account (ADR-0207 D2 — a personal private repo
can only grant write).

Verified by: `repo-fetchable`.

## 2. Hosted studio access (the live read)

Grant their **Google identity** access to the hosted studio, so their desktop app can read live tree
state through the IAP-gated API (ADR-0207 D4 — the ADR-0113 thick-client read loop, *not* a per-dev
Cloud SQL grant).

Day-to-day this is the in-UI **Members** panel (ADR-0043). The gcloud grant/revoke fallback and the
optional invite-email wiring are in [`studio-cloud.md`](studio-cloud.md).

Verified by: `hosted-read`.

## 3. Send the install message

The dev needs the one-liner and nothing else. Once the owner has applied
[`dist-bucket.tf`](dist-bucket.md) and published the script:

```powershell
irm https://storage.googleapis.com/storytree-dist/install.ps1 | iex
```

Until that apply lands, deliver `infra/install.ps1` directly (the repo is private, so a raw GitHub
URL will not fetch unauthenticated) — see [`install.md`](install.md).

Worth saying explicitly in the message: **they will sign in three times** — GitHub (code), Google
(live data), and Claude (their own agent). Three identities, each doing exactly one job. This is
accepted onboarding friction, not a bug (ADR-0207 §Consequences), and the installer + guide walk
them through it.

Also worth saying: **storytree never handles their Claude credential** (D3). The installer installs
the CLI; the dev signs in themselves in their own browser on their own subscription, and the token
stays in their own `~/.claude`. storytree only detects that a logged-in CLI exists.

## 4. What the dev does — and how they self-serve from here

They run the one-liner. It installs the prerequisites idempotently, provisions the read-only
checkout, and verifies with `storytree doctor`. If anything is wrong they run the guide:

```powershell
pnpm storytree guide          # check + explain, enacts nothing
pnpm storytree guide --fix    # repair, re-check, repeat
```

The guide repairs what it can by re-running idempotent installer steps, stops and instructs when the
action is theirs (the Claude sign-in), and produces a **secrets-redacted escalation blob** for you
when — and only when — the block is genuinely yours: a revoked repo grant, or a missing IAP grant.
That blob names the unmet invariant and what you need to do, so an escalation should never be a
debugging session.

## Revoking

Reverse grants 1 and 2 (remove from the org; remove from the Members panel). The dev's checkout and
any locally-installed app keep working offline against the seed — the live read is what stops. There
is no remote-wipe story in v1, and the public distribution bucket is deliberately not an access
control point (`dist-bucket.md` explains why gating it would be the wrong lever).
