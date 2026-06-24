---
status: accepted
decided: 2026-06-24
---
# ADR-0101: Hosted login-protected website content editor — Cloud Run + Keystatic GitHub mode

## Status

accepted (2026-06-24) — direct owner decision this session: the storytree-web content editor gets a
**hosted, login-protected** deployment so the owner can edit page copy from any browser, no local
terminal. **Builds on [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)**
(the website wired into the system; it added the dev-only, local-mode Keystatic CMS this now extends),
**mirrors [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md)** (the hosted studio: Cloud Run in
`storytree-498613`, keyless runtime SA — here **without IAP**, because the editor's login is GitHub's),
and reuses the **[ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md)** keyless-IAM posture
on the **[ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md)** GCP project.

## Context

storytree-web is a static Astro marketing site, published to here.now on every push to its `main`
(merge = publish). ADR-0066 made its copy editable through Keystatic, but **only in local dev**:
`astro.config.mjs` loads the editor integrations only under `astro dev`, storage is `local` (edits
write the working tree), and publishing is `npm run publish:content` (commit + push to main). So
editing needs the owner's laptop, a terminal, and localhost — the one machine. The owner wants to
edit **from anywhere, behind a login**, while the public site stays exactly as static and cheap as it
is today.

Two forces shape the choice. (1) here.now is static-only — it cannot run Keystatic's `/api/keystatic`
routes — so a hosted editor needs a *server* host, separate from the public deploy. (2) The public
build must stay **byte-identical**: a CMS regression on the marketing surface is unacceptable.

## Owner decision (2026-06-24)

1. **Auth + hosting: Keystatic GitHub mode on Cloud Run, no IAP.** The owner signs in with their
   **GitHub account**; Keystatic's GitHub App gates editing to repo **write-collaborators** and
   commits saves straight to `main` (firing the existing here.now deploy). That GitHub login **is**
   the login — one gate, native to the tool. The service is a public Cloud Run service
   (`--allow-unauthenticated`); the project has no Organization, so no policy blocks a public service,
   and the editor page is inert without a write-collaborator login.
   - **Rejected — a Google IAP gate in front** (the studio's ADR-0042 model): it would add a *second*
     login (Google to reach the page, then GitHub to commit) for a solo owner, the only gain being to
     hide an already-inert editor page. Not worth the double sign-in + the extra IAP OAuth console
     setup. Fronting with IAP stays available if exposure ever widens beyond the owner.
   - **Rejected — Keystatic Cloud / Vercel / Netlify**: less infra to own, but a new third-party
     vendor that splits where "the system" is hosted; Cloud Run keeps the editor next to the studio
     with the same keyless posture.

2. **Two build targets from one repo, env-gated.** A `PUBLIC_STORYTREE_WEB_EDITOR=github` flag selects
   the **editor** target (a standalone `@astrojs/node` server + Keystatic in GitHub storage); the
   unflagged `astro build` stays the **public** target (`output: 'static'`, no adapter, no CMS) and is
   verified byte-identical. The local `npm run cms` flow (local storage) is preserved as the offline
   fallback.

## Decision

- **`astro.config.mjs` builds three shapes** (public / local-dev / hosted-editor), chosen by env+argv.
  Only the editor target loads the react+keystatic integrations and the `@astrojs/node` (standalone)
  adapter; the public target loads neither and emits the same static `dist/` as before any CMS
  existed. The flag is `PUBLIC_`-prefixed because `keystatic.config.ts` is isomorphic (it runs in the
  server *and* the admin-UI browser bundle), so both sides must read the same storage switch via
  `import.meta.env` — a server-only `process.env` would mismatch.
- **`keystatic.config.ts` storage is GitHub mode** (`{ owner: 'HuaMick', name: 'storytree-web' }`)
  under that flag, else `local`. In the editor target the marketing pages still **prerender to static
  HTML**; only Keystatic's `/keystatic` + `/api/keystatic` routes are server-rendered on demand.
- **Hosting is Cloud Run** (`storytree-web-editor`, australia-southeast1, scale-to-zero), public, with
  a dedicated runtime service account. Unlike the studio, the editor needs **no Cloud SQL access** (it
  commits to GitHub, not the event store), so the SA's only grant is Secret Manager read on the three
  Keystatic secrets — a strictly narrower runtime identity than ADR-0042's.
- **Secrets live in Secret Manager, never the repo.** Keystatic's GitHub App setup emits four values;
  the three secrets (`KEYSTATIC_GITHUB_CLIENT_ID` / `_CLIENT_SECRET` / `KEYSTATIC_SECRET`) are injected
  at runtime, and `PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` is a plain (non-secret) env var. storytree-web is
  (or will be) a public repo, so keeping secrets out of it is load-bearing.
- **CD mirrors the studio's keyless path** ([ADR-0046](0046-continuous-deployment-for-the-hosted-studio.md)
  / ADR-0021): a storytree-web GitHub Actions workflow authenticates via Workload Identity Federation
  and `gcloud run deploy`s the editor on push to `main`, scoped to editor-affecting paths so a pure
  content edit only rebuilds here.now. The WIF pool gains a binding for the `HuaMick/storytree-web`
  repo (today it authorizes the parent repo only).

## Consequences

- The owner edits from any browser: GitHub sign-in → edit → save → commit to `main` → here.now
  redeploys in ~a minute. No terminal, no localhost.
- The public site is provably unchanged: the editor adapter/integrations are unreachable from the
  unflagged build (verified — the public `dist/` hashes identically to the pre-change tree).
- Two deploys now ride a storytree-web push to `main`: here.now (the public static site, always) and —
  for editor-affecting changes — the Cloud Run editor. They are independent.
- The GitHub App is an **owner-authorized, account-level** artifact (created/installed on HuaMick); its
  secrets rotate via new Secret Manager versions, picked up on the next deploy.
- A public Cloud Run service is exposed, but inert without a write-collaborator GitHub login; both the
  editor UI's content reads and its writes require the OAuth token.
- Cost: Cloud Run scale-to-zero (~$0 idle, pennies active); no load balancer (no IAP), no DB. The
  editor adds essentially nothing to the standing footprint.
- Delivered incrementally: the byte-identical two-target **build** landed first (storytree-web#12); the
  GitHub App + first Cloud Run deploy are the owner-gated follow-up, then the CD workflow + Terraform
  codification + the parent `web` submodule-pointer bump.

## References

- [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) — the hosted-studio Cloud Run + keyless-SA
  pattern this mirrors (minus IAP).
- [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) — the website wiring
  + the local-mode Keystatic CMS this extends to a hosted editor.
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) — keyless IAM / runtime-SA posture.
- [ADR-0046](0046-continuous-deployment-for-the-hosted-studio.md) — the studio's keyless merge→deploy
  CD this mirrors.
- [ADR-0015](0015-gcp-hosting-cloud-sql-event-store.md) — the GCP project the service lives in.
