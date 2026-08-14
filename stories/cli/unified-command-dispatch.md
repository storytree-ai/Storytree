---
id: "unified-command-dispatch"
tier: capability
story: cli
title: "storytree <verb> dispatches to the owning organism and returns a typed envelope"
outcome: "storytree <verb> parses args, hydrates credentials, dispatches to the owning organism, and returns a typed Envelope/exit code; offline commands run with no DB."
status: mapped
proof_mode: integration-test
depends_on: []
---

# `storytree <verb>` dispatches to the owning organism and returns a typed envelope

**Outcome —** `storytree <verb>` (`packages/cli/src/main.ts`) parses args, hydrates credentials,
dispatches to the owning organism, and returns a typed `Envelope`/exit code; offline commands run
with no DB.

## Guidance

- `main.ts` is the single entry: parse → `buildStore` (in-memory seed offline, `PgLibraryStore`
  under `--pg`) → dispatch by verb → render the `Envelope` → map `ok` to an exit code.
- Credentials hydrate from `secrets.ts` (`CLAUDE_CODE_OAUTH_TOKEN`, `STORYTREE_DB_USER` from
  `~/.storytree/secrets.json` when unset; env wins), so no command needs an env-var prefix.
- The shim holds no domain logic — every verb forwards into the organism that owns it; the CLI only
  parses, dispatches, and maps to the envelope/exit code.

## Contracts (3)

1. **`verb-dispatch-to-envelope`** — a known verb reaches its organism and returns `ok:true`
   - **asserts —** `storytree library` (and another verb, e.g. `tree`) dispatch to their surface
     and return a well-formed `Envelope` with a `next:` block; an unknown verb returns `ok:false`
     guidance, not a throw.
2. **`offline-safe-and-write-gated`** — reads run offline; writes refuse without `--pg`
   - **asserts —** a read command returns `ok:true` against the in-memory seed with no DB; a write
     without `--pg` returns `ok:false` ("run with --pg") and a non-zero exit code.
3. **`a-flag-is-declared-exactly-once`** — `CLI_OPTIONS` is the single source of truth for every flag
   - **asserts —** the `values` type `run()` reads is INFERRED from `CLI_OPTIONS` (via `parseCliArgs`),
     so the key sets match in both directions and each option shape carries the type `parseArgs`
     infers for it — a plain string flag `string | undefined`, a repeatable one `string[] | undefined`,
     a boolean with a `default` a non-optional `boolean`. Every declared flag survives a real parse;
     an UNDECLARED flag is still refused, so deriving the type did not weaken ADR-0343's one strict
     parse before dispatch.
   - **covers —** `packages/cli/src/commands.ts` (`CLI_OPTIONS`, `parseCliArgs`, `CliValues`)
   - **proven by —** `packages/cli/src/cli-options-inference.test.ts` (REAL, passing); the type-level
     half is checked by `tsc --noEmit`, a gate rung.
   - **why it is its own contract —** adding a flag used to need TWO hand-kept declarations, and
     omitting the second failed as a cluster of `TS2339`s naming the DISPATCH lines that read the
     field rather than the missing declaration — every error pointing away from the fix
     (`tool-signal-gaps-arc`, friction `cli-flag-needs-two-hand-kept-declarations`). The assertions
     fail AT the declaration if a hand-kept mirror is ever reintroduced. This is NOT a decomposition
     of the composition root: ADR-0343 fences `commands.ts` as ONE capability, and what changed is how
     a flag is TYPED inside it, not dispatch, arg parsing or ownership.
