# Adjudication — open calls (updated 2026-06-04)

Worktool. Tier 1 and the human/UI posture are now **decided** and folded into the ADRs / glossary / open-questions. What's left is below.

## Decided (folded in)
- **A. Story edges** → stories form a DAG and depend on each other; a story→story edge is **derived** from capability deps (and authorable at decomposition), derived = source of truth. → ADR-0002, glossary.
- **B. Event vocabulary** → **bespoke** pi-shaped event types; OTel export deferred. → ADR-0006, open-q §8.
- **C. Proof signing** → **a dedicated UAT subagent signs** (builder ≠ signer); human optional; events as SSOT. → ADR-0007/0008.
- **D. operator-attested** → **dropped**. Deterministic things are guardrail-code + a contract; behavioural things are guidance (ADR-0010). Retires v1 `manual_signings`. → ADR-0007.
- **E. Human/UI posture** → **autonomous by default**; the human intervenes at will, not as a gate; the dedicated UAT subagent is the independence safeguard. → ADR-0008.

## Still open — your call when you want

### F. Concurrency residuals (open-q §3)
(1) git worktree per node for pi's *code edits*, or a shared checkout under DBOS isolation? (2) claim node-scoped or file-glob? **Rec:** worktree-per-node edits + node-scoped claims to start.

### G. Per-node budget (open-q §6 · ADR-0005)
Budget in iterations / tokens / $ / blend, and default ceiling? **Rec:** $-ceiling + an iteration backstop; defaults after the first real runs.

### H. Decomposition loop + per-node spec (open-q §4)
An explicit decompose-before-implement loop (name it), and does any per-node spec file survive (never `contract`)? **Rec:** explicit `decomposition` phase; no spec file — drive from a prompt template + the unit's `outcome`/`guidance`.

### Guidance system — new opens (ADR-0010)
Asset schema + the injection mechanism (how an asset attaches to an agent's context) · curation/graduation (when a forum note becomes a guidance asset) · trace-explorer scope (studio-only vs agent tool). → open-q §5/§9.

### Tier 3 (defer-OK)
**K** lenses: adopt frontier + blast_radius early · **L** epic tier: not now · **M** brownfield mapping mechanism: defer · **N** ADR-number scheme: ULID filenames if you ever author in parallel again. (Channel/post and the knowledge tier are now homed in ADR-0010.)
