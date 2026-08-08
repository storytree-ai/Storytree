---
status: accepted
decided: 2026-07-17
arc: explorer-onboarding-arc
load_bearing: true
---
# ADR-0207: Explorer onboarding v1: desktop entrypoint, dev-owned Claude auth, hosted live read, public distribution

## Status

accepted (2026-07-17) — decided/directed by the owner in conversation on 2026-07-17. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask. The v1 design foundation for `explorer-onboarding-arc`.

## Context

The owner wants to hand storytree to two trusted devs as **explorers**: people who read the
system and talk to it, never grow it. The scope fence comes from the arc: exploring the story
tree, the library, and the decision log through a conversation with their *own* agent — growing
or mapping a fresh tree is a later, separate initiative. The devs have no repo write access and
bring their own tokens; the owner shares no secrets.

The forces: (a) the project is all-in on the **desktop app** (ADR-0174/0175 terminal pivot), so
the app — not a wiki page of commands — is the onboarding surface, and a dev's natural entry is
a terminal one-liner the owner sends; (b) the in-app guide needs model power, which means an auth
token, which is exactly the thing an app must never harvest; (c) a personal private GitHub repo
cannot grant read-only collaborators; (d) live tree state (verdicts, claims, wisps) lives in the
IAP-fenced Cloud SQL store, and per-dev DB IAM grants are heavy; (e) whatever hosts the install
artifacts also serves every future silent auto-update, so install-time auth debt compounds
forever.

## Decision

**D1 — Entrypoint: one re-runnable terminal command installs everything.** The owner sends a
single one-liner (PowerShell / sh variants). It checks and installs prerequisites (git, Node 24),
runs GitHub device sign-in, clones the repo read-only, provisions it (`pnpm install`), installs
the Claude Code CLI if absent, then installs and launches the desktop app. **Every step is
idempotent and no-ops when already satisfied** (the ADR-0162 provision-hook pattern) — this is a
load-bearing invariant, because D6 reuses the steps as the repair vocabulary. Total dev actions
in the terminal: paste the command, enter one device code.

**D2 — Access: the repo moves to a free GitHub organization; explorers get the Read role.** A
personal private repo can only grant write; a free org grants read-only. The invite ceremony is
owner-side: GitHub Read grant + IAP membership grant (see D4) + the install message. v1 is
**desktop-only** — no browser-studio surface ships in the tour; the IAP grant exists solely as
the identity for the hosted live read.

**D3 — Auth: storytree never handles Claude credentials.** The in-app wizard's "Connect Claude"
step launches `claude` login in the embedded terminal seat; the dev completes OAuth in their own
browser with their own subscription; the CLI stores its own credentials in their `~/.claude`.
Storytree only *detects* that a logged-in CLI exists and lights the guide seat — the credential
never passes through storytree code, at install, at runtime, ever. The guide talks to Claude
exclusively through the dev's authenticated CLI (the Agent SDK spawns that CLI, so an SDK-driven
guide inherits the same login). **Optional post-tour fork:** a dev tired of re-login is
*instructed* by the guide to run `claude setup-token` themselves and keep the result in their own
`~/.storytree/secrets.json` (their machine, their file — the existing hydration seam); the app
neither executes nor captures it. **All-in on the Claude path first**: Cursor is deferred — its
tokens bill raw API cost rather than charging a subscription, the wrong economics for an
always-on guide. Get one path right before adding more.

**D4 — Data: hosted live read from day one.** The explorer's desktop app reads live tree state
(verdicts, claims, presence) through the IAP-gated hosted studio API with the dev's Google
identity — the ADR-0113 thick-client read loop — not via per-dev Cloud SQL IAM grants.
Consequence accepted: an explorer holds three identities, each doing one job —
GitHub (code), Google (live data), Anthropic (their agent).

*(Correction in place, 2026-08-08 per ADR-0139 — the decision above is untouched. This clause also
read: "The offline checkout + in-memory seed remains the zero-credential fallback when the hosted
path is unreachable." That fallback no longer exists. [ADR-0302](0302-online-or-nothing-the-live-store-is-the-only-source-of-truth.md)
D1 deleted the seed file the fallback read, and D2 dropped offline as a supported mode outright.
The hosted live read of D4 is therefore no longer the preferred of two paths but the only one, which
STRENGTHENS D4 rather than reversing it — hence a correction, not a supersede. What an explorer does
when the hosted path is unreachable is a genuinely OPEN question this ADR no longer answers, and it
is not answered here either; it belongs to whoever next works `explorer-onboarding-arc`.)*

**D5 — Distribution: a public GCS bucket on the existing GCP project.** Install scripts, app
binaries, and the auto-update feed (`latest.yml`, electron-updater generic provider) are served
as public objects from a `storytree-dist` bucket, terraform-codified beside the studio infra and
published by Cloud Build on release. Rationale: the install script must be fetchable pre-auth,
and **auto-update inherits install's auth model forever** — public objects keep day-30 updates as
dumb-simple as day-0 install, where private GitHub releases would put a refreshing token inside
the app permanently. The binary is not the secret: the assets the private repo and IAP actually
protect (the tree, the library, live verdicts) live in the checkout and the live store, not in
the Electron package. If gating is ever wanted, the documented upgrade path is serving downloads
through the IAP-protected Cloud Run using the same Google identity as D4 — not bucket IAM, which
would recreate the runtime-token problem.

**D6 — The guide verifies and repairs setup.** Two layers. Bottom: `storytree doctor` — a
deterministic, read-only, offline CLI that probes each setup invariant (git/Node present,
checkout provisioned, repo fetchable, Claude CLI present + logged in, app version
vs checkout HEAD) and emits machine-readable results plus a fix hint per failure. Top: the guide
wraps it conversationally — run doctor → explain the failure plainly → propose the fix → dev
confirms → re-run the corresponding **idempotent installer step from D1** → re-doctor. Repair is
not new machinery; it is the installer re-invoked. The fence: the guide fixes the dev's *local
environment only* (deps, clone freshness, login state, app restart) — it never writes to the
tree, the library, or the DB (explorer mode has no `--pg`). When doctor cannot fix (access
revoked, subscription lapsed), the guide generates a secrets-redacted diagnostic blob for the dev
to paste to the owner — structured escalation, not a debugging session.

*(Correction in place, 2026-08-08 per ADR-0139 — the decision above is untouched. The invariant list
also named **"seed readable"**. That probe is GONE, not renamed: it existed to answer "is this
checkout intact?" with zero credentials, so once [ADR-0302](0302-online-or-nothing-the-live-store-is-the-only-source-of-truth.md)
D1 deleted its subject there was nothing left to read, and repointing it at the live store would have
defeated the one property it was for. `packages/cli/src/doctor.ts` keeps a comment where it stood.
`checkout-provisioned` answers the weaker question and remains. Everything else in D6 stands: doctor
is still deterministic, read-only and credential-free, so the zero-credential repair path this clause
buys is intact — one of its six probes is simply no longer a thing that can be true or false. Two
prose surfaces in `doctor.ts` — its module header and its own `--help` text — still advertise the
retired probe; that is a code fix, outside the decision log, and is reported rather than made here.)*

**Non-goals (v1):** no tree growing or mapping, no explorer writes of any kind, no Cursor or
other agent paths, no browser-studio tour surface, no bucket gating.

## Consequences

- The org transfer (D2) is a prerequisite with blast radius: remotes, CI config, the
  `legacy/Agentic` submodule pin, and the storytree-web repo's pin need a once-over when the
  repo URL changes (GitHub leaves redirects, so breakage is soft, but pins should be updated).
- The installer's idempotency invariant (D1) is load-bearing twice over — re-runs are the retry
  story *and* the repair story (D6). An installer step that is not safely re-runnable is a bug
  even if install succeeds.
- The never-handle-credentials invariant (D3) is the trust model that makes handing the app to
  outside devs defensible, and it must survive every future guide increment: instruct, detect,
  never execute-and-capture.
- Public binaries (D5) mean the app's UI code is effectively public even while the repo is
  private. Accepted deliberately; revisit only via the IAP-fronted download path, never by
  gating the bucket.
- Three sign-ins (GitHub, Google, Claude) is real onboarding friction, accepted as the cost of
  the three genuinely separate trust domains. The wizard should present them as one continuous
  flow; friction artifacts from the two real devs will tell us if collapse is worth pursuing.
- `storytree doctor` (D6) is a new CLI surface that must stay read-only and offline-capable —
  it is itself part of the zero-credential path.

## References

- `explorer-onboarding-arc` (the initiative; live artifact) — this ADR is its D3-stamped design
  foundation.
- ADR-0174/0175 (desktop terminal pivot / app guide direction), ADR-0113 (thick-client hosted
  read loop), ADR-0042/0043 (hosted studio + members), ADR-0162 (idempotent provision-hook
  pattern), ADR-0110 (design-time ratification), ADR-0183 (arcs/plans; the `arc:` stamp).
- ADR-0198 (Cursor leaf retirement — the same economics that defer the Cursor explorer path).
