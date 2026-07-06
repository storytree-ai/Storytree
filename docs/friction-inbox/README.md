# friction-inbox — offline/remote capture staging (ADR-0168 D2)

This directory is the **offline capture fallback** for `friction` Library items — the surviving role
of the disk shelf the ADR-0168 proposal recommended before the owner chose the Library `friction` kind
(the employees' upward voice channel).

## Why it exists

Filing friction normally writes the live shared store: `storytree friction new --file <doc.json> --pg`.
But a **remote 443-only session** (Claude Code on the web) cannot open the Postgres data socket
(port 3307 is blocked by the 443-only egress), and an **offline docs session** has no DB at all. So a
session that cannot reach the live store runs `storytree friction new` **without `--pg`**, and the CLI
stages the **same validated doc JSON** here — `docs/friction-inbox/<id>.json` — for the session's PR.
Session-end never acquires a hard DB dependency (the ADR-0162 bar).

## Lifecycle — the adjudicator files it live (migrate-only)

A staged item is **not yet in the Library**. Filing it live and deleting the staging file is the
**adjudicator/librarian's** job (the next live session's librarian pass), mirroring `sync-corpus`:

1. `pnpm db:up`
2. `storytree friction new --file docs/friction-inbox/<id>.json --pg` (files it live)
3. delete `docs/friction-inbox/<id>.json` (the staging file has served its purpose)

`friction new` is **not** the migrator — it only stages. The migrate-only filing is deliberately the
adjudicator's, so nothing auto-lands into the live worklist unreviewed.

## The gate

Every `*.json` staged here is validated against the `Friction` schema, **fail-closed**, by
`friction-inbox.test.ts` in `pnpm -r test` (so it runs in the local gate **and** in CI — the remote
sessions that produce these files may never run the full local gate). A malformed staging file blocks
the merge. This `README.md` is not JSON, so the check ignores it.
