---
id: "codex-author-arms-feedback"
tier: contract
story: agent
capability: live-codex-leaf
arc: inner-loop-exit-arc
title: "Let a Codex author given feedback commands run the spine's proof against its own replica"
outcome: "A Codex author given feedback commands lets the leaf run the spine's proof against its own replica during a phase, and reports what ran."
status: proposed
proof_mode: contract-test
depends_on: [codex-exec-args-arm-feedback, codex-replica-dependency-links, codex-feedback-endpoint, codex-bound-suspends-during-feedback]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/codex-author-feedback.test.ts"]
    sourceGlobs: ["packages/agent/src/codex-author.ts"]
  real:
    testFile: "packages/agent/src/codex-author-feedback.test.ts"
    sourceFile: "packages/agent/src/codex-author.ts"
    scope:
      testGlobs: ["packages/agent/src/codex-author-feedback.test.ts"]
      sourceGlobs: ["packages/agent/src/codex-author.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
    editsExisting: true
---

# Let a Codex author given feedback commands run the spine's proof against its own replica

**Outcome —** A Codex author given feedback commands lets the leaf run the spine's proof against its
own replica during a phase, and reports what ran.

## Proof walkthrough

Given a real workspace under `os.tmpdir()` holding the phase's required target and a synthetic
`node_modules`, and a `CodexPhaseAuthor` over it with exact promotion manifests, one `run_proof`
feedback command, and an injected runner that plays Codex. The runner answers `login status` as a
ChatGPT-managed login. For `exec` it reads the endpoint URL and the token variable's name from the
arguments and the token from the command's environment, calls `tools/list` and then `tools/call` for
`run_proof` over HTTP, writes the required target inside the replica, and returns one successful JSONL
turn. The feedback command's `run` records the root it receives, whether the replica's dependency links
exist at that moment, and the state of the leaf's bound.

1. Author the phase. `run` received the replica's root, never the workspace; the replica's root
   `node_modules` was a link when it ran; and the leaf's bound was suspended for the run and resumed
   after it.
2. `feedbackToolNames` is `["mcp__spine__run_proof"]`, and `feedbackRuns` holds that one run with its
   phase, tool and exit code.
3. The phase promoted exactly the required target into the workspace, and no `node_modules` path
   appears among the run record's changed paths.
4. The token appeared in the exec child's environment and in none of its arguments.
5. After `author()` returns, a request to the captured URL cannot connect. Repeat with a runner that
   also writes an unlisted file, so promotion is refused, and with a runner that throws after reading
   the URL: in both, the request cannot connect either.
6. Author the same phase with an author constructed without feedback commands. The exec arguments
   carry `mcp_servers={}` and no `mcp_servers.spine.*` key, the environment carries no
   `STORYTREE_SPINE_MCP_TOKEN`, the replica holds no `node_modules` when the runner runs, and
   `feedbackToolNames` and `feedbackRuns` are both empty.

The observable is what the injected runner and the feedback command recorded, the author's
`feedbackToolNames`, `feedbackRuns` and run record, the workspace after promotion, and whether the
endpoint still accepts a connection.

## Guidance

**Leaf test acceptance (prompt-exposed).** Both AUTHOR_TEST and IMPLEMENT must read this spec in full
at `stories/agent/codex-author-arms-feedback.md`: the `## Proof walkthrough` and every clause of the
assertion under `## Contracts (1)`. The contract-id briefing in the phase prompt is an index, never the
acceptance.

**The adapter is dormant.** Nothing in `packages/orchestrator/src/resolve-prove-spec.ts` passes
feedback commands to the Codex leaf yet, so no build behaviour changes when this lands. Leave that file
alone. `packages/agent/src/sdk-author.ts` is out of scope and must not be edited. Two tests outside
this contract's write scope pin today's wiring — `packages/cli/src/codex-leaf-prompt.test.ts` and
`packages/orchestrator/src/resolve-prove-spec.test.ts` assert that a Codex author's
`feedbackToolNames` is `[]` — and they stay green only because an author without feedback commands
behaves exactly as it does today.

**The change is `CodexPhaseAuthor`.** It composes what the four contracts it depends on added under
`packages/agent/src`: the `feedback` option of `buildCodexExecArgs`, `linkReplicaDependencies` in
`codex-replica-links.ts`, `openCodexFeedbackEndpoint` in `codex-feedback-endpoint.ts`, and the bound
control on `CodexCommand`. Read each before editing; only `codex-author.ts` is writable here.

- **The command shape.** Feedback commands are the Codex-local `{ name, description, run(replicaRoot) }`
  that `codex-feedback-endpoint.ts` declares. `codex-author.ts` re-exports that type for its callers
  rather than declaring a second copy, and never widens the Claude leaf's `FeedbackCommand`.
- **Order inside `author()`.** Link the replica's dependencies before its before-snapshot is taken
  (ADR-0570 D3): a link made after it is observed as an unlisted path and refuses the whole phase. Open
  the endpoint before `codex exec` starts, and close it in a `finally` that covers every exit after it
  opened.
- **The token.** Add it to the exec child's environment under the endpoint's variable name, and hand
  `buildCodexExecArgs` only that name.
- **The tool timeout.** Whatever `toolTimeoutSec` the author passes must exceed a feedback run's own
  bound, ten minutes by default (ADR-0570 D4), so Codex never abandons a run the spine is still
  executing. `@storytree/agent` imports no other storytree package, so the orchestrator's
  `DEFAULT_PROOF_TIMEOUT_MS` cannot be imported here.
- **The records.** Each `feedbackRuns` entry is `{ phase, tool, code }`: `packages/drive/src/node-build.ts`
  renders a live author's runs through exactly those three fields.
- **The red must be an assertion.** This contract edits a file that already exists, so the spine
  declares an assertion red and measures its kind by counting the assertions that ran. A test that
  imports by name a value `codex-author.ts` does not export yet never loads, runs no assertion, and is
  refused at CONFIRM_RED as the wrong red. `CodexPhaseAuthor` and its constructor already exist; reach
  the feedback path through them, and use type-only imports for the new types.

**Tests.** Use a real temp directory as the author's `cwd`, so the replica is seeded and promotion is
real, with `promotionManifests` naming the required target. An injected runner arms no timer, so
witness the suspension through the bound control the exec command carries, in the shape
`codex-bound-suspends-during-feedback` gave it. Close or remove everything the test opened in
`finally`, and bound each await as `within` does in `codex-author.test.ts`. `packages/agent` is inside
the mutation rung, and CI's Linux run once found a survivor that only Windows had killed. So a test
names every operator-facing string by its LITERAL value, never through an exported constant:
`mcp_servers={}`, `mcp_servers.spine.url`, `mcp_servers.spine.bearer_token_env_var`,
`STORYTREE_SPINE_MCP_TOKEN`, the `spine` server name and `mcp__spine__run_proof`. Every test title
starts with the contract-line id and a colon —
`test("feedback-runs-in-the-replica-and-closes-with-the-phase: …")` — because that prefix is how
coverage binds a test to this contract. Use `node:test` and `node:assert/strict`: the spine's focused
proof runs this file under Node, and `pnpm --filter @storytree/agent test` runs it under Bun, so it must
pass under both.

## Contracts (1)

1. **`feedback-runs-in-the-replica-and-closes-with-the-phase`** — a Codex author with feedback commands lets the leaf run the spine's proof against its own replica, and leaves nothing open behind the phase.
   - **asserts —** `CodexPhaseAuthor` constructed with feedback commands, driven by an injected runner
     that plays Codex over HTTP, invokes the feedback command's `run` with the phase replica's root,
     never the workspace, while the replica's dependency links exist and the leaf's bound is suspended
     for the duration of the run, and never reports those links as changed paths; `feedbackToolNames`
     lists `mcp__spine__<name>` per command, and `feedbackRuns` holds the run; the endpoint is closed
     once `author()` returns — on success, on a refused promotion and on a thrown runner — so a later
     request cannot connect; the token value appears in the exec child's environment and never in its
     arguments; the phase still promotes exactly its manifest's observed targets; and an author
     constructed without feedback commands issues today's exec arguments, `mcp_servers={}` included,
     opens no endpoint and makes no links.
   - **covers —** `packages/agent/src/codex-author.ts` (`CodexPhaseAuthor`).
   - **proven by —** a new `packages/agent/src/codex-author-feedback.test.ts` through the default
     focused REAL proof, with the `@storytree/agent` typecheck as the pre-promotion wall.
