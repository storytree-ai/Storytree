---
status: accepted
decided: 2026-07-26
arc: linked-session-context-arc
---
# ADR-0241: Context traversal traces persist locally per session, unretained and version-pinned

## Status

accepted (2026-07-26) — ratified by the owner in conversation on 2026-07-26, after increment 2 landed
(PR #905) and the design had been exercised end-to-end rather than only argued: the landing session
captured its own traversal, and ADR-0235 clause 6's metadata-only rule was verified against the trace
file's actual bytes on disk.

Authored by the `session-orchestrator` on 2026-07-26 while consuming `linked-session-context-plan-3`
(inc 2 of `linked-session-context-arc`), which named this fork and deliberately did not settle it. It
was born `proposed` because it rested on existing corpus precedent — ADR-0203's owner-directed,
default-on, shared-store usage capture, of which this is a strictly more conservative case — rather
than on a fresh owner direction. The owner's ratification supplies that direction. It does not
re-open ADR-0235; it fills the storage hole ADR-0235's own consequences left explicitly open.

## Context

ADR-0235 settled *what* context traversal records and *where* it is observed, but deliberately left
storage open — its consequences state that "query paths still need normal access control, retention,
and schema-version handling". Increment 1 (PR #887) shipped the vocabulary, an in-memory
record/replay trace, and one decorator over the orientation-runner boundary. Nothing in production
composes it: zero real traces exist, the trace dies with the process, and there is no query path.

Increment 2 activates capture at the terminal CLI's single dispatch boundary. That boundary is
**process-per-invocation**, so it forces the storage question immediately: an in-memory trace cannot
survive one `pnpm storytree …` call, let alone join two. Three forces shape the answer:

- **Offline is the default.** CLAUDE.md makes analysis, docs, pure-TS units, and the whole gate run
  with no DB and no network. Routing capture through Cloud SQL would put a DB connection on the hot
  path of every read command, including the gate's own internal CLI calls.
- **The shared instance sleeps.** ADR-0114 stops the Postgres instance nightly (01:00–07:00
  Australia/Sydney). A DB-backed sink would silently stop capturing for six hours a day — exactly the
  long-running overnight sessions this arc most wants to measure.
- **Traces are per-session evidence, not shared library state.** Unlike artifacts or verdicts, a
  traversal trace is one session's local observational residue. Nothing yet reads another session's
  trace, so shared storage would be speculative coupling.

The capture-default question — whether the owner's own sessions are observed without opting in — was
raised as a possible owner fork. **ADR-0203 already settles it by precedent**: per-slice token-usage
capture was owner-directed, is additive-and-never-fail-closed, is on by default, and persists to the
*shared* `events.usage_event` table. This decision is strictly more conservative than that
precedent — metadata-only, local-only, never leaving the machine, with an explicit opt-out — so it
needs no separate owner fork.

## Decision

1. **A trace is a local per-session append-only JSONL file.** One file per session at
   `~/.storytree/traces/<sessionId>.jsonl`, overridable by `STORYTREE_TRAVERSAL_DIR` (the
   `STORYTREE_SECRETS_FILE` precedent: env always wins). Each line is
   `{"v":1,"event":{…}}` — one validated ADR-0235 event, appended synchronously.

2. **Capture is on by default and opt-out via `STORYTREE_TRAVERSAL=off`.** Following ADR-0203's
   default-on precedent. With capture off — or when no session identity resolves — no file is
   created and the command's envelope is byte-identical to an uninstrumented run.

3. **Capture is additive and fail-silent, never fail-closed.** The whole capture path is wrapped so
   no telemetry failure can change an exit code, alter an envelope, or block a command (the
   `attachDeltaFooter` contract). A telemetry bug must never break the CLI.

4. **Validation happens before the bytes are written.** Every event parses through the ADR-0235
   vocabulary *before* it reaches the file, so an invalid or content-bearing event is never
   persisted. This makes ADR-0235 clause 6's metadata-only rule a claim about bytes on disk, not
   merely about a parsed object in memory, and it is asserted that way.

5. **Reads are tolerant and honestly partial.** The reader skips any line that is a duplicate
   identity, malformed, truncated, or carries an unknown `v`, returns a `skipped` count alongside the
   replay, and never throws. A query over a corrupt or crash-truncated trace still succeeds and
   *states* what it skipped. A silent partial is forbidden; the in-memory trace's duplicate-identity
   throw must not become a crashing query command.

6. **`v` is a per-line schema-version pin.** Version lives on each line, not in a file header, so a
   trace written across a version change stays readable and the unreadable lines are counted rather
   than guessed at.

7. **No retention, rotation, eviction, or size cap.** Traces are unbounded and never automatically
   deleted or trimmed. ADR-0235 authorizes no context-removal mechanism, and silently dropping
   observational history would destroy the long-session evidence this arc exists to gather. Growth is
   metadata-only and expected to be small; if it ever needs bounding, that is a separate owner
   decision with measurements attached.

8. **No shared-database read path yet, behind a sink seam.** The sink is a narrow
   append/read/list interface so a Postgres-backed implementation can be swapped in when the hosted
   studio genuinely needs to read another session's trace. Until then, local-only avoids access
   control, retention policy, and migration questions nothing yet needs answered.

9. **Session identity is supplied, never derived by the sink.** The sink takes `sessionId` as an
   argument. The CLI resolves it (worktree-derived `deriveIdentity()`, with `STORYTREE_SESSION_ID`
   overriding), which keeps the sink free of `@storytree/drive` and gives a future spawned-agent
   adapter a seam to inherit a parent session id.

## Consequences

- Real traces exist for the first time, survive process exit, and can be replayed by a later
  command — the precondition every remaining increment of this arc is blocked on.
- Capture keeps working fully offline and through the nightly DB sleep window, which is when the
  longest sessions actually run.
- Traces are per-machine. Cross-session and hosted-studio views cannot read them until a shared sink
  lands, and a trace does not travel with a PR.
- A local file is not access-controlled beyond the user's filesystem. Metadata minimization
  (ADR-0235 clause 6) is what keeps that acceptable, and it is enforced at write time on the bytes.
- Unbounded growth is accepted deliberately. It is a known, measurable follow-up rather than a
  silent trim, and the arc would rather pay disk than lose long-session evidence.
- A per-line version pin costs a few bytes per event and removes whole-file migrations.
- Default-on means the owner's own read patterns are recorded locally from the moment this lands.
  That is the arc's stated intent, matches ADR-0203, and is opt-out with one environment variable.
- **D3's "never alters an envelope" is a claim about telemetry FAILURE, and under capture-ON it no
  longer implies whole-stdout invariance — narrowed 2026-07-29** when ADR-0260 D3 landed (capability
  `offer-follow-edges`). An offering read now PRINTS a pasteable follow-up command per followable
  ref, carrying `--from-offer <candidateSetId>`, and that id is a fresh visit id per invocation — so
  whole-stdout equality no longer holds even between two capture-on runs of the same command. This is
  ADR-0260 D3's declared cost ("the agent-facing command surface changes"), not a weakened rule, and
  nothing above is re-decided. What survives is twofold, and is now machine-pinned by the story's
  standing UAT leg 5: the command's own **payload** and exit code stay byte-identical whatever
  capture does, and the offer-carrying lines appear **only** where an offer is genuinely recorded —
  never under `STORYTREE_TRAVERSAL=off`, never without a resolvable session identity — so **D2's
  opt-out-clean envelope stands unchanged**. That second half is load-bearing rather than cosmetic: a
  printed id naming a candidate set nothing recorded is an id an agent can return into a forged edge,
  and an early draft of the capability argued those two capture preconditions needed no gate at all,
  reasoning only about what gets RECORDED and never about what gets PRINTED. Leg 5 falsified it on
  the first run.

## References

- [ADR-0235: Record context traversal at deterministic runtime boundaries](0235-record-context-traversal-at-deterministic-runtime-boundaries.md)
- [ADR-0203: Per-slice token-usage capture and the token-analytics surface](0203-per-slice-token-usage-capture-and-the-token-analytics-surfac.md)
- [ADR-0260: A followed edge needs an offer it can be joined to](0260-a-followed-edge-needs-an-offer-it-can-be-joined-to-and-order.md) — D3 puts the offer's id on the rendered surface, narrowing D3's envelope claim above to the payload.
- [ADR-0114: The hosted DB sleeps on a fixed 01:00–07:00 Sydney window](0114-hosted-db-sleeps-on-a-fixed-1am-7am-sydney-window-replacing.md)
- [ADR-0162: Manage session onboarding cost](0162-manage-session-onboarding-cost-optimize-the-cost-centers-the.md)
- Plan: `linked-session-context-plan-3` · Arc: `linked-session-context-arc`
