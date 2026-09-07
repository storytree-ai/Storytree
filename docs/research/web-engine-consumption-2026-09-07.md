# What `storytree-web` can actually consume — the ADR-0537 D3 scoping finding

**Date:** 2026-09-07 · **Increment:** `the-website-stops-copying-the-engine` ·
**Commissioned by:** ADR-0537 D3 ("scope D before committing to its route").

**Read this before proposing any route for the engine mirror. Do not re-run the sweep** — every
number below was measured on this box on 2026-09-07 against `web` at `861ebfb` and the parent at
`1abcbc78`, and the experiment is written out so it can be repeated rather than re-invented.

---

## The question

ADR-0537 D2 decided that the copied engine mirror ENDS, and named as its stronger form *"the website
consumes the engine as a real dependency instead of holding a copy refreshed by
`pnpm sync:web-engine`"*. D3 held the route open until somebody established what `storytree-web`'s
build and deploy can actually resolve. This is that finding.

## What the site is, as a build

`storytree-web` is a **public** repository (`storytree-ai/storytree-web`) that is also this repo's
`web/` submodule, pinned by exact SHA. It is **npm**, not pnpm — Node 22, `npm ci` in both
workflows. It has two:

- `ci.yml` (pull request) — `npm ci` → `typecheck` → `test` (`bun test src/`) → `build`
  (`astro build`), then **automerges any green non-draft PR without the `hold` label** and dispatches
  the deploy.
- `deploy.yml` (`push: main` + `workflow_dispatch`) — `npm ci` → `npm run build` → assert the
  expected pages exist → `npm run publish:here`, using the repo secret **`HERENOW_TOKEN`**.

Both use `actions/checkout@v4` with no `submodules:` input, so **a web build never sees this
repository**. The engine reaches it only as copied source under `web/src/lib/forest-world{,-r3f}/`.

## FINDING 1 — the site can consume the parent's raw TypeScript directly. Measured, three legs green.

The engine packages have **no build step**: `@storytree/forest-world` and
`@storytree/forest-world-r3f` both declare `"exports": { ".": "./src/index.ts" }` and are consumed
as raw TS via `tsx` (the house convention). The sync therefore does three things beyond copying —
stamps an `@generated` banner, rewrites NodeNext `./x.js` relative specifiers to extensionless
`./x`, and rewrites `@storytree/forest-world` bare specifiers in the R3F package to a relative
sibling path (`packages/cli/src/web-engine-sync.ts`).

**None of that rewriting is load-bearing.** The experiment:

```sh
# in web/
rm -rf src/lib/forest-world src/lib/forest-world-r3f
ln -s ../../../packages/forest-world/src     src/lib/forest-world
ln -s ../../../packages/forest-world-r3f/src src/lib/forest-world-r3f
# astro.config.mjs — vite.resolve.alias:
#   '@storytree/forest-world': new URL('./src/lib/forest-world/index.ts', import.meta.url).pathname
# tsconfig.json — compilerOptions.baseUrl "." + paths:
#   "@storytree/forest-world": ["./src/lib/forest-world/index.ts"]
npm run build && npm run typecheck && npm test
```

| leg | against the synced copy | against the parent's raw sources |
| --- | --- | --- |
| `npm run build` | pass | **pass** |
| `npm run typecheck` | pass | **pass** |
| `npm test` | pass | **pass — 1517 tests, 0 fail, 72 files** |

The test count is *higher* under the symlink because the parent's own `*.test.ts` files ride along
(the sync filters them out); they pass unmodified inside the site's Bun runner.

And the output is not merely equivalent, it is **identical**: `sha256` over every file in `dist/`,
sorted, is `67768ee7…50f7d02` under both. The copy contributes nothing to what gets published.

**Adaptation cost of consuming the engine directly: one Vite alias and one tsconfig `paths` entry.**
Vite resolves `./x.js` → `./x.ts` on its own, so the specifier rewriting the sync performs is
belt-and-braces rather than a requirement. `tsc` needs the `paths` entry because a bundler alias
does not reach it — that was the only red in the experiment, and it is two lines.

## FINDING 2 — the toll is the second REPOSITORY, not the copy. No dependency mechanism removes it.

This is the finding that matters, and it overtakes the mechanism D2 assumed.

The measured toll (paid 2026-09-07 by the session that raised the fork) was a branch in the web repo,
a sync rewriting **57 files**, a web PR, **a public deploy**, a submodule pin bump, and only then the
parent's own PR — for 23 insertions and 13 deletions that changed no pixel. The 57 files are the
*visible* part. The part that costs is the **commit in the other repository**, and every candidate
route still needs one:

- **A published package (registry).** Both repos are public, so a public npm scope is free and needs
  no auth on the deploy path. But it requires a **build step in a repo whose stated convention is
  that there is none** (or shipping raw TS and depending on every future consumer's bundler to
  transpile `node_modules`), a `@storytree` scope and an automation token, and version discipline on
  two packages currently pinned at `0.0.0`. It then still requires web to commit a version bump —
  and it puts a registry between the public site and its own deploy.
- **A git dependency on a pinned SHA.** **Not reachable with npm at all**: npm addresses a git
  dependency by repository root, and has no subdirectory support. This repository's root is a pnpm
  workspace, not `@storytree/forest-world`. It would need a per-package split repo, and still a
  committed SHA bump.
- **Web's CI checking out the parent.** Possible (the parent is public), but the checked-out ref is
  a pin held in web, so it is the submodule relationship inverted, with the same bump.
- **A floating range.** Does not help: both web workflows run `npm ci`, which installs strictly from
  `package-lock.json`. **The lockfile is the pin.** A dependency update is a committed lockfile
  change no matter how loose the range is.

⚠ **So "consume the engine as a real dependency" — D2's literal wording — does not end the toll.** It
swaps 57 copied files for a version-or-lockfile bump in the same second repository, still opens a web
PR, still fires a public deploy, and *adds* a registry or a build step to the publishing path. On
this finding it is **worse than both of the routes that remain**, and it should not be pursued.

## What actually ends it

Only two routes survive, and they are the two ADR-0537 D2 already names — the structural one and the
fenced fallback.

**(A) FOLD — `storytree-web` becomes `apps/web` in this workspace.** The engine becomes a
`workspace:*` dependency, exactly as `apps/studio` already consumes it today. `sync:web-engine` and
`check:web-engine` **delete** — with one copy there is no drift to check. One repository, one pull
request, one CI run; a change to `packages/forest-world/src` stops involving a second repo at all.
Finding 1 says the site's own toolchain can do this unchanged, and the dependency sets do not
conflict (web and `forest-world-r3f` already agree on react 19, three 0.185, drei 10, fiber 9, zod 3;
Astro is the only genuinely new top-level dependency). For scale: **57 of the web repo's 122 tracked
files — 47% — are the mirror**; the site's own source is 65 files.

  **What blocks it is one thing, and it is not technical.** The deploy must move to this repository,
  which needs `HERENOW_TOKEN` here. A GitHub secret cannot be read back out of `storytree-web`, so no
  agent can carry it across; only the owner can mint or paste it. That is a *task* for him, not a
  judgement — but the accompanying judgement is real and his: after the fold, a merge to this repo's
  `main` is what publishes the public site, where today a merge to a separate repo is.

**(B) AUTOMATE — the fenced fallback.** Fold the sync and the pin bump into the merge ceremony.
Note precisely what this buys and costs: the human stops having to remember, and the question stops
being forceable, because the toll becomes cheap rather than absent. ADR-0537 D2 permits this **only**
on a stated finding that the stronger form is unreachable. **This finding does not say that.** The
stronger form is reachable and technically de-risked; it waits on one secret.

**(C) A zero-secret variant worth naming.** If the parent hosted the site on GitHub Pages,
`actions/deploy-pages` authenticates by OIDC and stores no token at all. That changes the *host*, not
just the pipeline, so it is squarely the owner's call and is recorded here only so nobody rediscovers
it as if it were free.

## What happens to `check:web-engine`

Under (A) it **retires outright** — there is no second copy, so there is no drift question to ask.
Deleting it is not a loss of coverage; it is the coverage becoming unnecessary. (Its skip vocabulary
and the `NOTHING TO COMPARE` bootstrap branch go with it — see `packages/cli/src/gate-order.ts`.)
Under (B) it stays and gains a sibling that performs the sync rather than merely judging it.

## Where this went

The owner-facing fork is `oq-where-the-site-is-built-and-published-the-one-thing-only` on
`forest-geometry-rebuild-arc`. ADR-0537 D2 carries an in-place note recording that its "real
dependency" wording is overtaken by Finding 2.
