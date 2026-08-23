# Pre-migration `amends` edge snapshot — 2026-08-23

Frozen under **ADR-0431 D2**, immediately before every `amends` edge on a decision row became a
`dependsOn` pointer. It is the owner's condition on allowing an IN-PLACE rewrite instead of a
272-decision supersession fan-out, and it exists because nothing else can answer this question
afterwards: `library artifact history` records that a field changed and by how many characters,
never what it said, and since ADR-0403 made decisions ordinary store rows, git no longer archives
them either.

**What is NOT lost, and is therefore not duplicated here.** The amendment PROSE survives untouched
on both ends — the `**Amends** ADR-NNNN — <what moved>` block in each amender's `## Status`, and
the in-place annotation ADR-0139 D4 requires in each target's body. This file is the EDGE LIST: the
machine-readable half, which is the half the migration removes. Each row quotes the amender's own
block where it wrote one, so a reader need not open two decisions to see what the edge claimed.

**READ THE `what the amender said` COLUMN AS PARTIAL, AND THAT IS NOT A GAP IN THE RECORD.** The
`**Amends** ADR-NNNN — <what moved>` convention in an amender's `## Status` is RECENT; most of the
log predates it, so the column is populated for a minority of edges. What the 2026-08-23 annotation
drain guaranteed for 453 of 453 edges is the OTHER end — the in-place note in the TARGET's body
that ADR-0139 D4 requires — and that end is untouched by the migration and needs no copy here. A
blank cell means the amender wrote no block, never that the amendment went unexplained: open the
target.

Reproduce the *after* state with `pnpm probe:adr-graph`; the migration's acceptance test is that
the union adjacency and the walked chain depth are IDENTICAL before and after, because a rehome
changes neither endpoint.

## Counts at the freeze

| measure | value |
| --- | --- |
| decision rows | 424 |
| `amends` edges (all statuses) | 517 |
| `amends` edges whose SOURCE is accepted | 452 |
| distinct amending sources | 309 |
| distinct amended targets | 238 |
| edges whose target's body names the source | 496 |
| edges whose AMENDER wrote a `**Amends** ADR-NNNN` block | 76 |
| `dependsOn` pointers already on decision rows | 17 |
| decision rows already carrying `dependsOn` | 7 |
| rows tagged `load_bearing` (after the D4 freeze) | 221 |

## Every edge

`source → target`, with each end's status, and the amender's own block where it wrote one.

| source | source status | target | target status | what the amender said |
| --- | --- | --- | --- | --- |
| ADR-0011 | accepted | ADR-0004 | accepted | _(no block in the amender's Status)_ |
| ADR-0011 | accepted | ADR-0005 | accepted | _(no block in the amender's Status)_ |
| ADR-0016 | accepted | ADR-0006 | accepted | _(no block in the amender's Status)_ |
| ADR-0016 | accepted | ADR-0013 | accepted | _(no block in the amender's Status)_ |
| ADR-0030 | accepted | ADR-0012 | accepted | _(no block in the amender's Status)_ |
| ADR-0035 | accepted | ADR-0030 | accepted | _(no block in the amender's Status)_ |
| ADR-0038 | accepted | ADR-0036 | accepted | _(no block in the amender's Status)_ |
| ADR-0040 | accepted | ADR-0031 | accepted | _(no block in the amender's Status)_ |
| ADR-0040 | accepted | ADR-0033 | accepted | _(no block in the amender's Status)_ |
| ADR-0040 | accepted | ADR-0036 | accepted | _(no block in the amender's Status)_ |
| ADR-0040 | accepted | ADR-0038 | accepted | _(no block in the amender's Status)_ |
| ADR-0041 | accepted | ADR-0036 | accepted | _(no block in the amender's Status)_ |
| ADR-0041 | accepted | ADR-0038 | accepted | _(no block in the amender's Status)_ |
| ADR-0044 | accepted | ADR-0040 | accepted | _(no block in the amender's Status)_ |
| ADR-0045 | accepted | ADR-0040 | accepted | _(no block in the amender's Status)_ |
| ADR-0045 | accepted | ADR-0033 | accepted | _(no block in the amender's Status)_ |
| ADR-0048 | superseded | ADR-0041 | accepted | _(no block in the amender's Status)_ |
| ADR-0049 | accepted | ADR-0042 | accepted | _(no block in the amender's Status)_ |
| ADR-0051 | accepted | ADR-0029 | accepted | _(no block in the amender's Status)_ |
| ADR-0052 | accepted | ADR-0051 | accepted | **Amends** ADR-0051 — it built the one renderer and listed "one population, many rendered surfaces"; this adds one more surface (`.claude/agents/*.md`) on top of the same renderer, for the harness-native delegation path. |
| ADR-0053 | accepted | ADR-0023 | accepted | **Amends** ADR-0023 — extends its choose-your-own- adventure / pull-on-demand stance from the Library CLI's *own* commands to the CLI's *doctrine prose* generally; it does not overturn anything in ADR-0023 (the envelope contract, explore-to-earn-the-context, and the Library-CLI surface all stand). ADR-0023 stays `accepted`. |
| ADR-0055 | superseded | ADR-0023 | accepted | **Amends** ADR-0023: it carves out the `agent` kind as the one exception to "the live store is the edit surface"; every other kind stays live-canonical, so ADR-0023 stands. |
| ADR-0058 | accepted | ADR-0010 | accepted | _(no block in the amender's Status)_ |
| ADR-0059 | accepted | ADR-0057 | accepted | **Amends** ADR-0057 — fills in the E expansion its §5 named and deferred, without overturning §1–§4 (the inner loop stays the default; landing stays on the PR/CI rail; A–D stand). |
| ADR-0060 | accepted | ADR-0048 | superseded | **Amends** ADR-0048: ADR-0048 made the in-flight build the primary orbiting wisp but left its note "to SEE a wisp, run a build with `--store pg`" — i.e. the signal was opt-in; this ADR makes a live/real build feed it by default. |
| ADR-0061 | accepted | ADR-0046 | accepted | _(no block in the amender's Status)_ |
| ADR-0064 | accepted | ADR-0031 | accepted | _(no block in the amender's Status)_ |
| ADR-0067 | accepted | ADR-0037 | accepted | **Amends** ADR-0037 — its §5 open-question hygiene gate **refuses/warns** a live story build when a deciding ADR's OQ has an unprocessed operator answer, but it never *cleans up*: it cannot retire, reframe, or resolve anything; it just blocks and tells a human to do it by hand. This ADR adds the missing **cleanup** half — a curator that runs *after* a green build and actually retires / reframes / raises. The §5 gate is unchanged and still runs first (it is a real GATE; curation is advisory and runs only once the build is already green). |
| ADR-0068 | accepted | ADR-0010 | accepted | _(no block in the amender's Status)_ |
| ADR-0069 | accepted | ADR-0036 | accepted | _(no block in the amender's Status)_ |
| ADR-0071 | accepted | ADR-0016 | accepted | _(no block in the amender's Status)_ |
| ADR-0072 | accepted | ADR-0062 | accepted | _(no block in the amender's Status)_ |
| ADR-0073 | accepted | ADR-0062 | accepted | _(no block in the amender's Status)_ |
| ADR-0074 | accepted | ADR-0010 | accepted | _(no block in the amender's Status)_ |
| ADR-0074 | accepted | ADR-0068 | accepted | _(no block in the amender's Status)_ |
| ADR-0075 | accepted | ADR-0074 | accepted | _(no block in the amender's Status)_ |
| ADR-0076 | accepted | ADR-0073 | accepted | _(no block in the amender's Status)_ |
| ADR-0078 | accepted | ADR-0075 | accepted | _(no block in the amender's Status)_ |
| ADR-0079 | superseded | ADR-0041 | accepted | _(no block in the amender's Status)_ |
| ADR-0080 | accepted | ADR-0020 | accepted | _(no block in the amender's Status)_ |
| ADR-0080 | accepted | ADR-0048 | superseded | _(no block in the amender's Status)_ |
| ADR-0082 | accepted | ADR-0040 | accepted | _(no block in the amender's Status)_ |
| ADR-0083 | accepted | ADR-0007 | accepted | _(no block in the amender's Status)_ |
| ADR-0083 | accepted | ADR-0040 | accepted | _(no block in the amender's Status)_ |
| ADR-0083 | accepted | ADR-0082 | accepted | _(no block in the amender's Status)_ |
| ADR-0084 | accepted | ADR-0037 | accepted | _(no block in the amender's Status)_ |
| ADR-0085 | accepted | ADR-0083 | accepted | _(no block in the amender's Status)_ |
| ADR-0085 | accepted | ADR-0007 | accepted | _(no block in the amender's Status)_ |
| ADR-0086 | superseded | ADR-0084 | accepted | _(no block in the amender's Status)_ |
| ADR-0086 | superseded | ADR-0037 | accepted | _(no block in the amender's Status)_ |
| ADR-0090 | accepted | ADR-0042 | accepted | _(no block in the amender's Status)_ |
| ADR-0091 | accepted | ADR-0089 | proposed | _(no block in the amender's Status)_ |
| ADR-0092 | accepted | ADR-0059 | accepted | _(no block in the amender's Status)_ |
| ADR-0092 | accepted | ADR-0087 | accepted | _(no block in the amender's Status)_ |
| ADR-0093 | accepted | ADR-0066 | accepted | _(no block in the amender's Status)_ |
| ADR-0094 | accepted | ADR-0090 | accepted | _(no block in the amender's Status)_ |
| ADR-0094 | accepted | ADR-0091 | accepted | _(no block in the amender's Status)_ |
| ADR-0095 | accepted | ADR-0032 | accepted | _(no block in the amender's Status)_ |
| ADR-0097 | accepted | ADR-0085 | accepted | _(no block in the amender's Status)_ |
| ADR-0097 | accepted | ADR-0094 | accepted | _(no block in the amender's Status)_ |
| ADR-0097 | accepted | ADR-0083 | accepted | _(no block in the amender's Status)_ |
| ADR-0098 | accepted | ADR-0085 | accepted | _(no block in the amender's Status)_ |
| ADR-0099 | accepted | ADR-0007 | accepted | _(no block in the amender's Status)_ |
| ADR-0099 | accepted | ADR-0020 | accepted | _(no block in the amender's Status)_ |
| ADR-0100 | accepted | ADR-0074 | accepted | _(no block in the amender's Status)_ |
| ADR-0103 | accepted | ADR-0095 | accepted | _(no block in the amender's Status)_ |
| ADR-0103 | accepted | ADR-0023 | accepted | _(no block in the amender's Status)_ |
| ADR-0103 | accepted | ADR-0055 | superseded | _(no block in the amender's Status)_ |
| ADR-0104 | accepted | ADR-0020 | accepted | _(no block in the amender's Status)_ |
| ADR-0105 | accepted | ADR-0085 | accepted | _(no block in the amender's Status)_ |
| ADR-0105 | accepted | ADR-0097 | accepted | _(no block in the amender's Status)_ |
| ADR-0105 | accepted | ADR-0098 | accepted | _(no block in the amender's Status)_ |
| ADR-0106 | accepted | ADR-0044 | accepted | _(no block in the amender's Status)_ |
| ADR-0106 | accepted | ADR-0082 | accepted | _(no block in the amender's Status)_ |
| ADR-0106 | accepted | ADR-0097 | accepted | _(no block in the amender's Status)_ |
| ADR-0107 | accepted | ADR-0037 | accepted | _(no block in the amender's Status)_ |
| ADR-0107 | accepted | ADR-0097 | accepted | _(no block in the amender's Status)_ |
| ADR-0108 | accepted | ADR-0030 | accepted | _(no block in the amender's Status)_ |
| ADR-0109 | accepted | ADR-0090 | accepted | _(no block in the amender's Status)_ |
| ADR-0110 | accepted | ADR-0084 | accepted | _(no block in the amender's Status)_ |
| ADR-0111 | accepted | ADR-0109 | accepted | _(no block in the amender's Status)_ |
| ADR-0111 | accepted | ADR-0100 | accepted | _(no block in the amender's Status)_ |
| ADR-0112 | accepted | ADR-0108 | accepted | _(no block in the amender's Status)_ |
| ADR-0113 | accepted | ADR-0090 | accepted | _(no block in the amender's Status)_ |
| ADR-0113 | accepted | ADR-0108 | accepted | _(no block in the amender's Status)_ |
| ADR-0113 | accepted | ADR-0109 | accepted | _(no block in the amender's Status)_ |
| ADR-0114 | superseded | ADR-0015 | accepted | _(no block in the amender's Status)_ |
| ADR-0115 | accepted | ADR-0074 | accepted | _(no block in the amender's Status)_ |
| ADR-0117 | accepted | ADR-0113 | accepted | _(no block in the amender's Status)_ |
| ADR-0117 | accepted | ADR-0043 | accepted | _(no block in the amender's Status)_ |
| ADR-0119 | superseded | ADR-0113 | accepted | _(no block in the amender's Status)_ |
| ADR-0120 | accepted | ADR-0103 | accepted | _(no block in the amender's Status)_ |
| ADR-0120 | accepted | ADR-0023 | accepted | _(no block in the amender's Status)_ |
| ADR-0120 | accepted | ADR-0018 | accepted | _(no block in the amender's Status)_ |
| ADR-0121 | accepted | ADR-0009 | accepted | **Amends** ADR-0009 without overturning it: it *enacts* ADR-0009's typed claim on plain Postgres (the DBOS substrate ADR-0009 assumed was deferred by ADR-0019, so the claim was named-but-unbuilt). **Builds the typed-claims-with-refusal upgrade ADR-0033 §4 named-deferred** — that ADR's **Decision 4** deferred the enforcing claim ("No claims, no conflict refusal… It is not built now") *until* overlap conflicts became routine; the evidence arrived (the 2026-06-27 duplicate build below), so this builds it for the build surface. ADR-0033's advisory presence board (Decisions 1–3, 5) stands untouched; only the deferral of the enforcing claim is overtaken (ADR-0033 corrected in place per ADR-0139). Resolves open-questions §3 (b) claim granularity and (c) the conflict-resolution ceremony for the build surface. |
| ADR-0122 | accepted | ADR-0020 | accepted | **Amends** ADR-0020 — ADR-0020 made red→green non-forgeable for *the test the leaf authored*; this adds a check that every *declared* contract has a test, without overturning anything ADR-0020 decided. |
| ADR-0123 | accepted | ADR-0093 | accepted | _(no block in the amender's Status)_ |
| ADR-0124 | superseded | ADR-0048 | superseded | _(no block in the amender's Status)_ |
| ADR-0125 | superseded | ADR-0023 | accepted | **Amends** ADR-0023, ADR-0103, ADR-0120 — carves the glossary-bearing subset out of ADR-0023's live-canonical default (as ADR-0055 carved out agents), adds the seed→live overwrite that ADR-0103's migrate-only `sync-corpus` deliberately lacks, and makes ADR-0120's `check:corpus-content` classification canonicality-aware. It overturns none of them: every non-glossary-bearing non-agent doc stays live-canonical, `sync-corpus` stays migrate-only, `export-corpus` stays live→seed. |
| ADR-0125 | superseded | ADR-0103 | accepted | _(no block in the amender's Status)_ |
| ADR-0125 | superseded | ADR-0120 | accepted | _(no block in the amender's Status)_ |
| ADR-0126 | accepted | ADR-0122 | accepted | **Amends** ADR-0122 — ADR-0122 built the per-contract coverage check on STATIC NAME-PRESENCE and named the hollow-test hole as a deferred follow-on; this closes that hole, choosing the static path over the runtime one 0122 anticipated, without overturning anything 0122 decided. |
| ADR-0127 | accepted | ADR-0122 | accepted | **Amends** ADR-0122 — ADR-0122 built the per-contract coverage check as a LIVE-DERIVABLE tool (`storytree coverage` / `check:coverage`) and named "no coverage axis on the verdict shape" as a deferred follow-on (its "Option A"); this closes that follow-on by attesting coverage ON the signed verdict, without overturning anything 0122 decided. |
| ADR-0128 | accepted | ADR-0048 | superseded | _(no block in the amender's Status)_ |
| ADR-0130 | accepted | ADR-0005 | accepted | _(no block in the amender's Status)_ |
| ADR-0131 | accepted | ADR-0130 | accepted | _(no block in the amender's Status)_ |
| ADR-0131 | accepted | ADR-0108 | accepted | _(no block in the amender's Status)_ |
| ADR-0131 | accepted | ADR-0067 | accepted | _(no block in the amender's Status)_ |
| ADR-0132 | accepted | ADR-0108 | accepted | _(no block in the amender's Status)_ |
| ADR-0133 | accepted | ADR-0117 | accepted | _(no block in the amender's Status)_ |
| ADR-0133 | accepted | ADR-0042 | accepted | _(no block in the amender's Status)_ |
| ADR-0135 | accepted | ADR-0018 | accepted | **Amends** ADR-0018, ADR-0023, ADR-0120 — narrows the generated-view set to `assets.json` only (0018), drops `docs/glossary.md` from the seed/export surface (0023 §11), and makes `check:corpus-build` assets-only (0120 part 1). None overturned: `knowledge.json` stays the structured source, the non-agent tier stays live-canonical, and `check:corpus-build` still gates the remaining generated view. **Amended in turn (2026-07-18 — ADR-0210):** that "remaining generated view" — `assets.json` — is now retired too, with the `build-corpus.mjs` generator and the `check:corpus-build` gate. The committed generated-view set this ADR narrowed to one is now **zero**; `knowledge.json` is the sole committed corpus source. This ADR's glossary decision is unchanged. |
| ADR-0135 | accepted | ADR-0023 | accepted | _(no block in the amender's Status)_ |
| ADR-0135 | accepted | ADR-0120 | accepted | _(no block in the amender's Status)_ |
| ADR-0137 | accepted | ADR-0108 | accepted | _(no block in the amender's Status)_ |
| ADR-0138 | accepted | ADR-0121 | accepted | _(no block in the amender's Status)_ |
| ADR-0138 | accepted | ADR-0033 | accepted | _(no block in the amender's Status)_ |
| ADR-0139 | accepted | ADR-0037 | accepted | **Amends** ADR-0037 — narrows the frontmatter edge spec (§1): `supersedes_in_part` is retired as an edge type, and the ADR-health suite (§3) changes accordingly (the `supersede-in-part-note` check is removed; a new check forbids the retired edge). The ADRs-stay-source principle (0037 "does NOT decide": "ADRs = source; artifacts = derived") is preserved and leaned on — see Decision 5. |
| ADR-0141 | superseded | ADR-0079 | superseded | _(no block in the amender's Status)_ |
| ADR-0142 | accepted | ADR-0138 | accepted | _(no block in the amender's Status)_ |
| ADR-0142 | accepted | ADR-0033 | accepted | _(no block in the amender's Status)_ |
| ADR-0143 | accepted | ADR-0142 | accepted | _(no block in the amender's Status)_ |
| ADR-0143 | accepted | ADR-0033 | accepted | _(no block in the amender's Status)_ |
| ADR-0144 | accepted | ADR-0136 | accepted | _(no block in the amender's Status)_ |
| ADR-0145 | superseded | ADR-0123 | accepted | _(no block in the amender's Status)_ |
| ADR-0145 | superseded | ADR-0134 | superseded | _(no block in the amender's Status)_ |
| ADR-0146 | accepted | ADR-0140 | accepted | _(no block in the amender's Status)_ |
| ADR-0148 | superseded | ADR-0134 | superseded | _(no block in the amender's Status)_ |
| ADR-0148 | superseded | ADR-0145 | superseded | _(no block in the amender's Status)_ |
| ADR-0149 | accepted | ADR-0020 | accepted | **Amends** ADR-0020, ADR-0064 — the prove-it-gate (ADR-0020) gains a **security dimension where a unit declares one** (the ADR-0122 precedent of adding a gate check; the tier-based red→green machinery is untouched), and the spine-driven dependency add (ADR-0064 §2, `real.addDeps`) gains the **provenance/reputation check it explicitly noted it lacked** ("nothing checks a package name is real / non-malicious" before the add). Neither decision is overturned; both are extended. |
| ADR-0149 | accepted | ADR-0064 | accepted | _(no block in the amender's Status)_ |
| ADR-0150 | superseded | ADR-0134 | superseded | **Amends** ADR-0134 (re-decides §3's beat-4 "stories connect via roads … the wrong-way road" as a NEGATIVE antipattern teach — it becomes the POSITIVE dependency-layer-as-advantage teach), ADR-0145 (the 2.5D substrate STANDS unchanged — only what grows on it changes), and ADR-0148 (re-decides its "increment H opens from G's 'what's next' CTA" framing — H is no longer a separate CTA-gated phase but the SAME continuous walk continuing upstream). This is a NEW ADR, not an in-place edit of 134/145/148 (copy-on-write, ADR-0086/0139): their bodies stay as history, with a dated forward pointer added at each amended point. |
| ADR-0150 | superseded | ADR-0145 | superseded | _(no block in the amender's Status)_ |
| ADR-0150 | superseded | ADR-0148 | superseded | _(no block in the amender's Status)_ |
| ADR-0151 | accepted | ADR-0130 | accepted | _(no block in the amender's Status)_ |
| ADR-0151 | accepted | ADR-0131 | accepted | _(no block in the amender's Status)_ |
| ADR-0152 | accepted | ADR-0137 | accepted | _(no block in the amender's Status)_ |
| ADR-0152 | accepted | ADR-0108 | accepted | _(no block in the amender's Status)_ |
| ADR-0153 | superseded | ADR-0134 | superseded | _(no block in the amender's Status)_ |
| ADR-0153 | superseded | ADR-0145 | superseded | _(no block in the amender's Status)_ |
| ADR-0153 | superseded | ADR-0148 | superseded | _(no block in the amender's Status)_ |
| ADR-0153 | superseded | ADR-0150 | superseded | _(no block in the amender's Status)_ |
| ADR-0154 | accepted | ADR-0034 | accepted | **Amends** ADR-0034 — its §2 decision (process artifacts are *downstream, derived* views of the deciding ADRs, reference-don't-restate, the cited ADR wins) stands unchanged. What this narrows is §3's *staffing*: 0034 authored the first instances via a one-time fan-out workflow and assigned **no standing owner**, so the derivation never recurred. This ADR makes the derivation a standing librarian-curator charter. It does not overturn any 0034 decision. **Amended by ADR-0311 (2026-08-05):** the process↔entrypoint checker remains available, but its standalone root/CI gate obligation is retired. |
| ADR-0155 | accepted | ADR-0108 | accepted | _(no block in the amender's Status)_ |
| ADR-0155 | accepted | ADR-0133 | accepted | _(no block in the amender's Status)_ |
| ADR-0156 | accepted | ADR-0051 | accepted | _(no block in the amender's Status)_ |
| ADR-0156 | accepted | ADR-0052 | accepted | **Amends** ADR-0052 and ADR-0051, without overturning either. ADR-0052's thrust stands in full — delegatable agents are still generated, drift-gated, harness-native `.claude/agents/*.md` spawnable files — but its §1 render choice ("`renderAgentFile` wraps `renderAgentPrompt`", the full-body-inject keystone) is re-decided: the agent-file surface (and `storytree agents <name>`) now render an ESSENTIALS view, not the full inline. ADR-0051 is extended — its one renderer gains a THIRD mode (essentials) alongside the digest (CLAUDE.md, §3) and the full prompt (SDK leaf, §4), generalising the digest's pointer-manifest to the delegation surface. This is the natural completion of ADR-0053 over the one surface it never reached. |
| ADR-0157 | superseded | ADR-0134 | superseded | _(no block in the amender's Status)_ |
| ADR-0157 | superseded | ADR-0150 | superseded | _(no block in the amender's Status)_ |
| ADR-0157 | superseded | ADR-0153 | superseded | _(no block in the amender's Status)_ |
| ADR-0158 | accepted | ADR-0137 | accepted | _(no block in the amender's Status)_ |
| ADR-0158 | accepted | ADR-0152 | accepted | _(no block in the amender's Status)_ |
| ADR-0159 | accepted | ADR-0070 | accepted | _(no block in the amender's Status)_ |
| ADR-0160 | accepted | ADR-0158 | accepted | _(no block in the amender's Status)_ |
| ADR-0161 | accepted | ADR-0154 | accepted | _(no block in the amender's Status)_ |
| ADR-0161 | accepted | ADR-0156 | accepted | **Amends** ADR-0156 and ADR-0154 without overturning either. ADR-0156's essentials-only decision and CLI-first build order stand in full; this adds the constraint that its `storytree agents <name> --step` affordance and ADR-0154's process-graph must emit through ONE shared `node → next:` emitter over a compatible edge shape, and that ADR-0156's own way-of-working graduates a `process` artifact. ADR-0154's §2 derived-process model and its `check:surface-coverage` bijection stand; what this changes is its Consequences deferral of the process `next:`-graph follow-on — that item is **un-deferred** and folded into this arc under a standing owner. *(Tense corrected in place 2026-08-06 per ADR-0139; nothing here is re-decided. This read "its `check:surface-coverage` **gate** stand". ADR-0311 D2 retired that rung from root/CI policy — ADR-0154 D2 now records it as an on-demand diagnostic — so what stands is the bijection and the charter, not a gate obligation.)* |
| ADR-0165 | superseded | ADR-0153 | superseded | _(no block in the amender's Status)_ |
| ADR-0165 | superseded | ADR-0157 | superseded | _(no block in the amender's Status)_ |
| ADR-0166 | accepted | ADR-0074 | accepted | _(no block in the amender's Status)_ |
| ADR-0166 | accepted | ADR-0115 | accepted | _(no block in the amender's Status)_ |
| ADR-0167 | superseded | ADR-0134 | superseded | _(no block in the amender's Status)_ |
| ADR-0168 | accepted | ADR-0032 | accepted | _(no block in the amender's Status)_ |
| ADR-0168 | accepted | ADR-0095 | accepted | _(no block in the amender's Status)_ |
| ADR-0169 | accepted | ADR-0076 | accepted | _(no block in the amender's Status)_ |
| ADR-0170 | accepted | ADR-0108 | accepted | **Amends** ADR-0108 — the chat surface gains conversational continuity across sends; the one-intent-one-session shape of d.1/d.2 is extended, not overturned. The single-session guard (d.6) is unchanged: sequential resumed runs each terminate before the next starts, so the in-flight brake never sees two at once. |
| ADR-0172 | superseded | ADR-0134 | superseded | _(no block in the amender's Status)_ |
| ADR-0172 | superseded | ADR-0165 | superseded | _(no block in the amender's Status)_ |
| ADR-0172 | superseded | ADR-0167 | superseded | _(no block in the amender's Status)_ |
| ADR-0173 | accepted | ADR-0137 | accepted | _(no block in the amender's Status)_ |
| ADR-0174 | accepted | ADR-0137 | accepted | _(no block in the amender's Status)_ |
| ADR-0174 | accepted | ADR-0163 | accepted | _(no block in the amender's Status)_ |
| ADR-0174 | accepted | ADR-0164 | accepted | _(no block in the amender's Status)_ |
| ADR-0175 | accepted | ADR-0160 | accepted | _(no block in the amender's Status)_ |
| ADR-0175 | accepted | ADR-0163 | accepted | _(no block in the amender's Status)_ |
| ADR-0175 | accepted | ADR-0170 | accepted | _(no block in the amender's Status)_ |
| ADR-0175 | accepted | ADR-0173 | accepted | _(no block in the amender's Status)_ |
| ADR-0177 | superseded | ADR-0011 | accepted | _(no block in the amender's Status)_ |
| ADR-0177 | superseded | ADR-0030 | accepted | _(no block in the amender's Status)_ |
| ADR-0178 | accepted | ADR-0052 | accepted | _(no block in the amender's Status)_ |
| ADR-0178 | accepted | ADR-0177 | superseded | _(no block in the amender's Status)_ |
| ADR-0179 | accepted | ADR-0109 | accepted | _(no block in the amender's Status)_ |
| ADR-0180 | accepted | ADR-0117 | accepted | _(no block in the amender's Status)_ |
| ADR-0180 | accepted | ADR-0133 | accepted | _(no block in the amender's Status)_ |
| ADR-0181 | accepted | ADR-0164 | accepted | _(no block in the amender's Status)_ |
| ADR-0182 | accepted | ADR-0178 | accepted | _(no block in the amender's Status)_ |
| ADR-0183 | accepted | ADR-0002 | accepted | _(no block in the amender's Status)_ |
| ADR-0184 | accepted | ADR-0180 | accepted | _(no block in the amender's Status)_ |
| ADR-0186 | accepted | ADR-0174 | accepted | _(no block in the amender's Status)_ |
| ADR-0187 | accepted | ADR-0185 | accepted | _(no block in the amender's Status)_ |
| ADR-0188 | accepted | ADR-0185 | accepted | _(no block in the amender's Status)_ |
| ADR-0188 | accepted | ADR-0187 | accepted | _(no block in the amender's Status)_ |
| ADR-0189 | accepted | ADR-0174 | accepted | _(no block in the amender's Status)_ |
| ADR-0189 | accepted | ADR-0186 | accepted | _(no block in the amender's Status)_ |
| ADR-0190 | accepted | ADR-0186 | accepted | _(no block in the amender's Status)_ |
| ADR-0190 | accepted | ADR-0189 | accepted | _(no block in the amender's Status)_ |
| ADR-0191 | accepted | ADR-0188 | accepted | _(no block in the amender's Status)_ |
| ADR-0192 | accepted | ADR-0074 | accepted | _(no block in the amender's Status)_ |
| ADR-0192 | accepted | ADR-0166 | accepted | _(no block in the amender's Status)_ |
| ADR-0193 | accepted | ADR-0191 | accepted | _(no block in the amender's Status)_ |
| ADR-0193 | accepted | ADR-0188 | accepted | _(no block in the amender's Status)_ |
| ADR-0195 | accepted | ADR-0022 | accepted | _(no block in the amender's Status)_ |
| ADR-0196 | accepted | ADR-0037 | accepted | _(no block in the amender's Status)_ |
| ADR-0196 | accepted | ADR-0168 | accepted | _(no block in the amender's Status)_ |
| ADR-0196 | accepted | ADR-0183 | accepted | _(no block in the amender's Status)_ |
| ADR-0197 | accepted | ADR-0196 | accepted | _(no block in the amender's Status)_ |
| ADR-0198 | superseded | ADR-0030 | accepted | _(no block in the amender's Status)_ |
| ADR-0198 | superseded | ADR-0179 | accepted | _(no block in the amender's Status)_ |
| ADR-0199 | accepted | ADR-0033 | accepted | _(no block in the amender's Status)_ |
| ADR-0200 | accepted | ADR-0033 | accepted | **Amends** ADR-0033 (the board survives; its *data model* changes — the presence declaration doc is retired; worktree-derived identity and the never-blocking automation contract stand), ADR-0121 (claim-before-worktree generalises from builds to sessions), ADR-0138 (the claim gains grades; D2's hard-refuse stands for the work grade; "forced by guidance at spawn" hardens into "forced by machinery at workspace creation"), ADR-0142 (claim-at-declare becomes an upgrade on the ledger; the presence half of declare dies), ADR-0143 (the nudge re-aims at `worktree create`), and ADR-0199 ("presence rows are written by sessions only" becomes "presence rows are not written at all"). **Supersedes** ADR-0079 and ADR-0141 — both are lifecycle machinery for the presence rows this ADR retires (they remained operative until the arc's final increment landed the retirement on 2026-07-17, PRs #760–#766; their bodies stay as history). |
| ADR-0200 | accepted | ADR-0121 | accepted | _(no block in the amender's Status)_ |
| ADR-0200 | accepted | ADR-0138 | accepted | _(no block in the amender's Status)_ |
| ADR-0200 | accepted | ADR-0142 | accepted | _(no block in the amender's Status)_ |
| ADR-0200 | accepted | ADR-0143 | accepted | _(no block in the amender's Status)_ |
| ADR-0200 | accepted | ADR-0199 | accepted | _(no block in the amender's Status)_ |
| ADR-0202 | accepted | ADR-0095 | accepted | _(no block in the amender's Status)_ |
| ADR-0204 | accepted | ADR-0008 | accepted | **Amends** ADR-0008 — the free-text single-operator identity field retires; attribution everywhere comes from the verified identity the server already resolves. ADR-0008's comment substrate itself stands. |
| ADR-0205 | accepted | ADR-0204 | accepted | **Amends** ADR-0204 — narrows D2/D3: the HUD loses the brand chip and the avatar menu loses its Library/Documents navigation entries. ADR-0204's core (forest landing, topbar retired, the avatar presenting the verified identity, no new auth) stands untouched. |
| ADR-0206 | accepted | ADR-0044 | accepted | _(no block in the amender's Status)_ |
| ADR-0208 | accepted | ADR-0070 | accepted | _(no block in the amender's Status)_ |
| ADR-0208 | accepted | ADR-0159 | accepted | _(no block in the amender's Status)_ |
| ADR-0209 | accepted | ADR-0055 | superseded | _(no block in the amender's Status)_ |
| ADR-0209 | accepted | ADR-0082 | accepted | _(no block in the amender's Status)_ |
| ADR-0209 | accepted | ADR-0106 | accepted | _(no block in the amender's Status)_ |
| ADR-0209 | accepted | ADR-0184 | accepted | _(no block in the amender's Status)_ |
| ADR-0210 | accepted | ADR-0018 | accepted | **Amends** ADR-0018, ADR-0023, ADR-0026, ADR-0120, ADR-0135 — narrows the committed generated-view set from "`assets.json` only" (where ADR-0135 left it) to **zero**: `assets.json` is deleted (0018 §the generated view; 0023 §11 seed/export surface), the `build-corpus.mjs` generator and its `check:corpus-build` drift gate are removed (0120 part 1), and the `count-reconciliation` health check ADR-0026 introduced as one of its five checks is deleted outright rather than graduated (0026 §5/§6). None overturned: `knowledge.json` stays the structured seed, the live Cloud SQL store stays the canonical non-agent tier, and the agent tier stays seed-canonical. |
| ADR-0210 | accepted | ADR-0023 | accepted | _(no block in the amender's Status)_ |
| ADR-0210 | accepted | ADR-0026 | accepted | _(no block in the amender's Status)_ |
| ADR-0210 | accepted | ADR-0120 | accepted | _(no block in the amender's Status)_ |
| ADR-0210 | accepted | ADR-0135 | accepted | _(no block in the amender's Status)_ |
| ADR-0211 | accepted | ADR-0020 | accepted | _(no block in the amender's Status)_ |
| ADR-0212 | accepted | ADR-0048 | superseded | **Amends** ADR-0048, ADR-0138, ADR-0200 — it retires ADR-0048's build wisp as a SEPARATE drawable and folds its red→green band into ADR-0138 §5's claim wisp; it keeps ADR-0138 §5's honesty wall intact while collapsing the two-layer split that §5 assumed; and it reverses one ADR-0200 D7 detail (the `exploring` family's stationary-by-construction rule). None of the three is overturned as a whole. |
| ADR-0212 | accepted | ADR-0138 | accepted | _(no block in the amender's Status)_ |
| ADR-0212 | accepted | ADR-0200 | accepted | _(no block in the amender's Status)_ |
| ADR-0214 | accepted | ADR-0069 | accepted | _(no block in the amender's Status)_ |
| ADR-0217 | accepted | ADR-0214 | accepted | _(no block in the amender's Status)_ |
| ADR-0218 | accepted | ADR-0093 | accepted | _(no block in the amender's Status)_ |
| ADR-0219 | accepted | ADR-0214 | accepted | _(no block in the amender's Status)_ |
| ADR-0219 | accepted | ADR-0217 | accepted | _(no block in the amender's Status)_ |
| ADR-0221 | accepted | ADR-0218 | accepted | _(no block in the amender's Status)_ |
| ADR-0223 | accepted | ADR-0185 | accepted | _(no block in the amender's Status)_ |
| ADR-0224 | accepted | ADR-0217 | accepted | _(no block in the amender's Status)_ |
| ADR-0225 | accepted | ADR-0219 | accepted | _(no block in the amender's Status)_ |
| ADR-0226 | accepted | ADR-0221 | accepted | _(no block in the amender's Status)_ |
| ADR-0227 | accepted | ADR-0226 | accepted | _(no block in the amender's Status)_ |
| ADR-0228 | accepted | ADR-0088 | accepted | _(no block in the amender's Status)_ |
| ADR-0228 | accepted | ADR-0102 | accepted | _(no block in the amender's Status)_ |
| ADR-0229 | accepted | ADR-0171 | accepted | _(no block in the amender's Status)_ |
| ADR-0230 | accepted | ADR-0219 | accepted | _(no block in the amender's Status)_ |
| ADR-0231 | accepted | ADR-0226 | accepted | _(no block in the amender's Status)_ |
| ADR-0232 | accepted | ADR-0030 | accepted | _(no block in the amender's Status)_ |
| ADR-0232 | accepted | ADR-0130 | accepted | _(no block in the amender's Status)_ |
| ADR-0234 | accepted | ADR-0052 | accepted | _(no block in the amender's Status)_ |
| ADR-0234 | accepted | ADR-0178 | accepted | _(no block in the amender's Status)_ |
| ADR-0236 | superseded | ADR-0038 | accepted | _(no block in the amender's Status)_ |
| ADR-0236 | superseded | ADR-0040 | accepted | _(no block in the amender's Status)_ |
| ADR-0236 | superseded | ADR-0062 | accepted | _(no block in the amender's Status)_ |
| ADR-0236 | superseded | ADR-0222 | accepted | _(no block in the amender's Status)_ |
| ADR-0236 | superseded | ADR-0226 | accepted | _(no block in the amender's Status)_ |
| ADR-0237 | accepted | ADR-0093 | accepted | _(no block in the amender's Status)_ |
| ADR-0237 | accepted | ADR-0213 | accepted | _(no block in the amender's Status)_ |
| ADR-0237 | accepted | ADR-0215 | accepted | _(no block in the amender's Status)_ |
| ADR-0237 | accepted | ADR-0230 | accepted | _(no block in the amender's Status)_ |
| ADR-0238 | accepted | ADR-0038 | accepted | _(no block in the amender's Status)_ |
| ADR-0238 | accepted | ADR-0040 | accepted | _(no block in the amender's Status)_ |
| ADR-0239 | accepted | ADR-0183 | accepted | **Amends** ADR-0183 (D1's authored-mutation set and D3's "the arc is never otherwise edited" rule gain exactly one more mutation: the closing transition) and ADR-0196 (D2 already *authorised* an arc close-state write "only where a surface needs to WRITE the transition"; this ADR names the surface, the field, and the write path). Neither is overturned. |
| ADR-0239 | accepted | ADR-0196 | accepted | _(no block in the amender's Status)_ |
| ADR-0245 | accepted | ADR-0200 | accepted | _(no block in the amender's Status)_ |
| ADR-0246 | accepted | ADR-0133 | accepted | **Amends** ADR-0133 — §5's *"No work is scoped to it here"* no longer holds; work is now scoped, as `foreign-project-forest-arc`. ADR-0133 §1 (finish storytree's own tree first) is **not** reversed: this lifts a deferral, it does not re-prioritise. Relative priority remains an owner call. |
| ADR-0247 | accepted | ADR-0209 | accepted | _(no block in the amender's Status)_ |
| ADR-0249 | accepted | ADR-0211 | accepted | _(no block in the amender's Status)_ |
| ADR-0250 | accepted | ADR-0089 | proposed | _(no block in the amender's Status)_ |
| ADR-0254 | accepted | ADR-0250 | accepted | **Amends** ADR-0250 — it closes 0250's two deliberately-open owner-gated questions and corrects the one Context claim the owner's action overtook. It **overturns nothing**: 0250 D1 (remote sessions are offline-only), D2 (the fast legible refusal), D3's vehicle and guard, and D3.4's build trigger all stand exactly as written. |
| ADR-0255 | accepted | ADR-0033 | accepted | **Amends** ADR-0033: its never-blocking contract continues to govern ambient noticeboard automation, but a separate write-authority guard is blocking by design. **Amends** ADR-0121: claim-before-worktree extends from build scheduling to every agent source write; a non-worktree write is no longer an uncoordinated no-op, it is refused. **Amends** ADR-0143: its SessionStart nudge and landing gate remain useful feedback, but they are no longer the enforcement boundary for writes. **Amends** ADR-0200: the primary checkout lobby becomes mechanically read-only to agent harnesses, and the claim-gated workspace ceremony applies across harnesses rather than only to Storytree-owned spawners. |
| ADR-0255 | accepted | ADR-0121 | accepted | **Amends** ADR-0121: claim-before-worktree extends from build scheduling to every agent source write; a non-worktree write is no longer an uncoordinated no-op, it is refused. **Amends** ADR-0143: its SessionStart nudge and landing gate remain useful feedback, but they are no longer the enforcement boundary for writes. **Amends** ADR-0200: the primary checkout lobby becomes mechanically read-only to agent harnesses, and the claim-gated workspace ceremony applies across harnesses rather than only to Storytree-owned spawners. |
| ADR-0255 | accepted | ADR-0143 | accepted | _(no block in the amender's Status)_ |
| ADR-0255 | accepted | ADR-0200 | accepted | _(no block in the amender's Status)_ |
| ADR-0255 | accepted | ADR-0245 | accepted | **Amends** ADR-0245 *(edge recorded by the librarian pass on 2026-07-28 — this ADR was authored without citing it, and both ADRs independently amend ADR-0200 for the same hazard; the edge below is a record of what this body already effects, not a new decision)*. ADR-0245 diagnosed the same fault — uncommitted work in the shared primary checkout — and shipped the first enforcement of it to be **in force** *(build state corrected in place 2026-08-02: this read "the only enforcement … in force today", with a parenthetical that the write-time wall "enforces nothing yet". ADR-0257 increment 3 flipped the wall on the same day, so it is no longer the only one — see the note at the end of this block)*: its **D5.2 gate-time backstop**, `check:declared`'s lobby arm. **That arm stands and stays built.** *(Corrected in place 2026-08-06 per ADR-0139 — "stays built" is still true, "gate-time" is not. ADR-0311 D2 retired `check:declared` from root policy and CI, so the lobby arm is no longer a backstop at any gate; the code survives unwired and answers only when invoked directly. This ADR's D1 — the primary checkout is a read-only agent lobby — is untouched, and ADR-0284 owns what actually enforces it now.)* D4 below already places it in the feedback layer, and "Rejected alternatives" rejects the merge gate only as *the authority boundary*, never as defence in depth — "the late gate remains defence in depth" is this ADR's own words. What is amended is ADR-0245 D5's **ranking**: the gate is no longer "the boundary that matters", it is the late backstop behind a write-time wall. ADR-0245 D1/D2 are adopted unchanged and remain load-bearing here — the fault is a *condition of a checkout*, never an accusable session, which is why D1 above addresses the checkout rather than an identity. ADR-0245 D3/D4 (the push/delivery half) stay owner-parked and are untouched. |
| ADR-0256 | accepted | ADR-0252 | accepted | _(no block in the amender's Status)_ |
| ADR-0257 | accepted | ADR-0255 | accepted | **Amends** ADR-0255. The `amends: [255]` edge **now binds** (it bound on acceptance, 2026-07-28). ADR-0255 D2, D3, D5, D6 and D8 stand: repository writes are claim-bound, claim-before-workspace remains literal, the invariant is harness-neutral, one workspace session holds one wisp, and proof is behavioural. This ADR: |
| ADR-0258 | accepted | ADR-0250 | accepted | **Amends** ADR-0250 — it narrows 0250's framing, which was accurate about the Cloud SQL connector but was read, including by the session that wrote it, as a statement about database access in general. 0250's mechanism, its D2 refusal, and its D3 vehicle all stand. |
| ADR-0259 | accepted | ADR-0117 | accepted | **Amends** ADR-0117 — it generalises the brokered write endpoint from a narrow inner-circle build path into **the** client transport. 0117's trade (the server is the single DB authority; callers are authorized in-app; no per-caller Cloud SQL grant) is unchanged, and is the reason it generalises cleanly. |
| ADR-0262 | accepted | ADR-0122 | accepted | **Amends** ADR-0122 — the `amends: [122]` edge binds only on acceptance. ADR-0122's decision stands entire: a structural gate check maps each declared contract to an OBSERVED test by the naming convention, with no new signer. This adds to it twice and overturns neither — it holds that mapping's GRANULARITY against a clause-granular escalation (decisions 1 and 3), and it widens `parseContracts`, the unit 0122's decision enumerates, past the declared contract ids its first slice parsed (decision 2). The same additive shape as 0122's other two amenders, ADR-0126 (the vouching input) and ADR-0127 (the verdict axis). |
| ADR-0263 | superseded | ADR-0120 | accepted | _(no block in the amender's Status)_ |
| ADR-0264 | superseded | ADR-0237 | accepted | _(no block in the amender's Status)_ |
| ADR-0265 | proposed | ADR-0020 | accepted | **Amends** ADR-0020 — the `amends: [20]` edge binds only on acceptance. ADR-0020's decision stands entire: red-before-green is enforced by the deterministic spine as a phase machine, the executor observes and the model never reports. This holds that observation's GRANULARITY against a per-contract escalation, and overturns none of it. The same additive shape as the SIX existing `amends: [20]` edges — 0080, 0099, 0104, 0122, 0149, and nearest of all ADR-0211, which hardened WHAT counts as a trustworthy green without changing who observes it. A seventh additive edge on ADR-0020 is the established pattern, not a new one. Note 0122 among them: ADR-0262 amends 0122, so the two lanes are cousins in the log — this one amends 0020 directly, that one reaches it through 0122. |
| ADR-0269 | accepted | ADR-0252 | accepted | _(no block in the amender's Status)_ |
| ADR-0270 | accepted | ADR-0138 | accepted | _(no block in the amender's Status)_ |
| ADR-0270 | accepted | ADR-0200 | accepted | _(no block in the amender's Status)_ |
| ADR-0271 | accepted | ADR-0142 | accepted | **Amends** ADR-0142 — extends "the branch dies on merge" to "and the session's working life ends with it." ADR-0142 §1 (CI refuses a merged head branch) and §2 (claim-at-declare) stand untouched; §3's post-merge leg — cut a fresh branch, re-declare, keep working — stops being the default move and survives only inside a *fresh session*: the branch's death now takes its session with it. |
| ADR-0272 | accepted | ADR-0240 | accepted | _(no block in the amender's Status)_ |
| ADR-0272 | accepted | ADR-0069 | accepted | _(no block in the amender's Status)_ |
| ADR-0273 | superseded | ADR-0219 | accepted | _(no block in the amender's Status)_ |
| ADR-0273 | superseded | ADR-0230 | accepted | _(no block in the amender's Status)_ |
| ADR-0273 | superseded | ADR-0237 | accepted | _(no block in the amender's Status)_ |
| ADR-0274 | accepted | ADR-0219 | accepted | _(no block in the amender's Status)_ |
| ADR-0274 | accepted | ADR-0230 | accepted | _(no block in the amender's Status)_ |
| ADR-0274 | accepted | ADR-0237 | accepted | _(no block in the amender's Status)_ |
| ADR-0275 | accepted | ADR-0271 | accepted | _(no block in the amender's Status)_ |
| ADR-0277 | accepted | ADR-0274 | accepted | _(no block in the amender's Status)_ |
| ADR-0278 | accepted | ADR-0252 | accepted | **Amends** ADR-0252 — it charters a FIFTH cheap instrument alongside D1's four. Nothing in ADR-0252 is overturned: the two-phase discipline, the gate-resident advisory shape (D2), the per-located-finding advisory rule and per-instrument drain ceiling (D3), the process home (D4), and the blind-instrument escalation line all govern the new instrument exactly as they govern the other four. What changes is the roster's size, and therefore the denominator in `chartered coverage: N/4`. |
| ADR-0279 | proposed | ADR-0095 | accepted | _(no block in the amender's Status)_ |
| ADR-0280 | accepted | ADR-0219 | accepted | _(no block in the amender's Status)_ |
| ADR-0280 | accepted | ADR-0274 | accepted | _(no block in the amender's Status)_ |
| ADR-0283 | accepted | ADR-0282 | accepted | _(no block in the amender's Status)_ |
| ADR-0284 | accepted | ADR-0257 | accepted | _(no block in the amender's Status)_ |
| ADR-0285 | accepted | ADR-0283 | accepted | _(no block in the amender's Status)_ |
| ADR-0285 | accepted | ADR-0282 | accepted | _(no block in the amender's Status)_ |
| ADR-0286 | accepted | ADR-0282 | accepted | _(no block in the amender's Status)_ |
| ADR-0287 | superseded | ADR-0168 | accepted | _(no block in the amender's Status)_ |
| ADR-0288 | accepted | ADR-0271 | accepted | **Amends** ADR-0271 (D2(b), the actual chip mandate — "not merely mentioned") · ADR-0275 (D2's owner-gated clause narrowed; its four hard ends otherwise intact and re-affirmed by D4). - ADR-0168 D1 (the precedent: "nothing to report" as a first-class, FREE outcome at friction capture) · ADR-0110 (design-time alignment IS ratification — why this ADR is born accepted) · ADR-0055 (the agent tier is seed-canonical — why the fix lands in `knowledge.json`, not the live store) · ADR-0024 (the earns-its-place bar the exemplar chip cited against itself) · ADR-0139 (a genuine re-decision is a new ADR with `amends` edges, not an in-place rewrite). - Evidence: owner-commissioned factory self-load audit, 2026-08-02 — 88% agent-started sessions (29/33), 16/19 chips minted within 4 min of their own merge, 25/25 clicked / 0 dismissed, the 11-hop chain from the 2026-07-27 map-lag complaint, 0/336 chip prompts instructing a child to chip. Session-cost figures from ADR-0275's audit context (92.4 vs 102–109 min/PR; gate 46–52% of wall). - Arc: `factory-self-load-tune-the-guidance-loop-back-to-evidence-arc` (this is its first increment; the arc's other two recommendations are owner-held). - Note on ADR-0275's status: the commissioning brief flagged it as `proposed` on disk while `CLAUDE.md` stated its rule as binding. Checked — it is `accepted` on disk and on `main` (flipped in `27eea318`, decided 2026-08-01, `amends: [271]`). There was no discrepancy to resolve. |
| ADR-0288 | accepted | ADR-0275 | accepted | _(no block in the amender's Status)_ |
| ADR-0289 | accepted | ADR-0280 | accepted | _(no block in the amender's Status)_ |
| ADR-0290 | accepted | ADR-0252 | accepted | _(no block in the amender's Status)_ |
| ADR-0290 | accepted | ADR-0263 | superseded | _(no block in the amender's Status)_ |
| ADR-0291 | accepted | ADR-0051 | accepted | **Amends** ADR-0051 by adding Codex's native root main-session projection beside the existing CLAUDE.md projection. It does not change the specialist-agent population governed by ADR-0052. |
| ADR-0292 | accepted | ADR-0282 | accepted | _(no block in the amender's Status)_ |
| ADR-0292 | accepted | ADR-0283 | accepted | _(no block in the amender's Status)_ |
| ADR-0293 | accepted | ADR-0289 | accepted | _(no block in the amender's Status)_ |
| ADR-0294 | accepted | ADR-0070 | accepted | _(no block in the amender's Status)_ |
| ADR-0294 | accepted | ADR-0106 | accepted | _(no block in the amender's Status)_ |
| ADR-0295 | accepted | ADR-0247 | accepted | **Amends** ADR-0247, which retired the `model` witness eight days earlier. ADR-0247 anticipated exactly this: *"The owner's direction was explicitly reversible … Reviving the tier means a new ADR."* This is that ADR. It narrows rather than overturns: ADR-0247's binary witness split and its decisions 2–6 stand, and ADR-0209's rubric-judge machinery is **not** revived — see decision 2. |
| ADR-0296 | accepted | ADR-0038 | accepted | _(no block in the amender's Status)_ |
| ADR-0296 | accepted | ADR-0040 | accepted | _(no block in the amender's Status)_ |
| ADR-0296 | accepted | ADR-0226 | accepted | _(no block in the amender's Status)_ |
| ADR-0296 | accepted | ADR-0227 | accepted | _(no block in the amender's Status)_ |
| ADR-0297 | proposed | ADR-0168 | accepted | _(no block in the amender's Status)_ |
| ADR-0297 | proposed | ADR-0298 | accepted | _(no block in the amender's Status)_ |
| ADR-0298 | accepted | ADR-0168 | accepted | _(no block in the amender's Status)_ |
| ADR-0298 | accepted | ADR-0183 | accepted | _(no block in the amender's Status)_ |
| ADR-0299 | accepted | ADR-0093 | accepted | _(no block in the amender's Status)_ |
| ADR-0299 | accepted | ADR-0215 | accepted | _(no block in the amender's Status)_ |
| ADR-0299 | accepted | ADR-0237 | accepted | _(no block in the amender's Status)_ |
| ADR-0301 | accepted | ADR-0252 | accepted | _(no block in the amender's Status)_ |
| ADR-0302 | accepted | ADR-0120 | accepted | _(no block in the amender's Status)_ |
| ADR-0302 | accepted | ADR-0290 | accepted | _(no block in the amender's Status)_ |
| ADR-0303 | accepted | ADR-0271 | accepted | _(no block in the amender's Status)_ |
| ADR-0303 | accepted | ADR-0275 | accepted | _(no block in the amender's Status)_ |
| ADR-0304 | accepted | ADR-0022 | accepted | _(no block in the amender's Status)_ |
| ADR-0304 | accepted | ADR-0195 | accepted | _(no block in the amender's Status)_ |
| ADR-0305 | accepted | ADR-0183 | accepted | _(no block in the amender's Status)_ |
| ADR-0305 | accepted | ADR-0239 | accepted | **Amends** ADR-0239 D2 (`amends` edge added 2026-08-09, correcting a gap this ADR left when first landed): folding the terminal increment into its own document means `arc close` no longer writes it and the `lifecycle` flip in one atomic transaction — D1 below makes the terminal increment its own row like every other one. ADR-0239 D2's invariant (no closed arc without terminal prose) is unaffected; only the mechanism that delivered it changed, from atomicity to write order (increment first, then the flip). |
| ADR-0305 | accepted | ADR-0298 | accepted | _(no block in the amender's Status)_ |
| ADR-0307 | accepted | ADR-0209 | accepted | **Amends** ADR-0209 — its D5 explicitly "extend[s] ADR-0055's seed-canonical exception beyond agents" to the per-criterion `uat-criterion` detail class, and D5 is accepted and load-bearing with **70 seed detail artifacts** resting on it *(count corrected in place 2026-08-05, ADR-0139: this ADR was drafted saying "73", a figure inherited unchecked from ADR-0209 and ADR-0247; `git ls-tree` shows the directory held 70 files on 2026-08-04 and had held 70 since 2026-08-03, when ADR-0294 increment 1 deleted four)*. The posture 0055 established therefore has a second home, and the seed removal kills it in both. Only D5's *canonicality direction* moves; D5's substance — one detail artifact per detailed UAT criterion, owned by `story-author`, authored atomically with the hierarchy — is untouched, which is why this is an `amends` and not a second supersession (ADR-0139). |
| ADR-0307 | accepted | ADR-0247 | accepted | _(no block in the amender's Status)_ |
| ADR-0308 | accepted | ADR-0270 | accepted | _(no block in the amender's Status)_ |
| ADR-0309 | accepted | ADR-0209 | accepted | _(no block in the amender's Status)_ |
| ADR-0309 | accepted | ADR-0307 | accepted | _(no block in the amender's Status)_ |
| ADR-0310 | proposed | ADR-0270 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0122 | accepted | **Amends** ADR-0122, ADR-0126, ADR-0143, ADR-0154, ADR-0161, ADR-0168, ADR-0200, ADR-0202, ADR-0215, ADR-0216, ADR-0245, ADR-0252, ADR-0298, ADR-0301 and ADR-0302. Their coverage, hollow-test, session-anchoring, process ownership, context-DAG, friction, claim, memory-lease, website-experience, verification and live-store decisions remain current. What retires is only their claim that a named standalone check must be a root/CI gate rung or that its drain ceiling blocks landing. |
| ADR-0311 | accepted | ADR-0126 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0143 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0154 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0161 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0168 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0200 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0202 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0215 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0216 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0245 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0252 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0298 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0301 | accepted | _(no block in the amender's Status)_ |
| ADR-0311 | accepted | ADR-0302 | accepted | _(no block in the amender's Status)_ |
| ADR-0312 | accepted | ADR-0260 | accepted | _(no block in the amender's Status)_ |
| ADR-0314 | accepted | ADR-0267 | accepted | _(no block in the amender's Status)_ |
| ADR-0315 | accepted | ADR-0031 | accepted | _(no block in the amender's Status)_ |
| ADR-0316 | proposed | ADR-0314 | accepted | _(no block in the amender's Status)_ |
| ADR-0317 | accepted | ADR-0310 | proposed | _(no block in the amender's Status)_ |
| ADR-0318 | accepted | ADR-0260 | accepted | _(no block in the amender's Status)_ |
| ADR-0319 | accepted | ADR-0288 | accepted | **Amends** ADR-0288 — D2's closing-leg arm is narrowed to *invented* follow-ups; D1's separation of "may this session continue?" from "must this be queued?" is what this ADR builds on and leaves intact; D3 (declining is stated, never silent) and D5 (no durable record for a decline) stand. ADR-0288 D6's mechanism prose for editing `session-orchestrator` is corrected in place per ADR-0139 (ADR-0307 D1 retired the seed-canonical agent tier ADR-0055 described). - ADR-0271 D2 (the debrief's three parts — (b) chip-or-decline and (c) where it lives are different questions, which D4 above pulls apart) · ADR-0275 D1 Axis 1/Axis 2 and D2 (unchanged, and *applied* rather than amended: Axis 2 is the vehicle call D2b hands the orchestrator, Axis 1 is the mandatory fresh worktree inside it, and the four hard ends stand — see D5) · ADR-0303 (an escalation is a landing, not a wait — the never-wait invariant this ADR does not touch) · ADR-0110 (design-time alignment IS ratification, in the deciding conversation — why this ADR is `proposed`) · ADR-0139 (correct in place when the decision has not changed) · ADR-0307 D1 (the agent tier is live-canonical — D6's edit path) · ADR-0095 (memory graduation — why the silo prunes on acceptance) · ADR-0168 D1 (the free-outcome precedent ADR-0288 followed) · ADR-0310 D3 and ADR-0317 (the fork closed at the triggering incident). - Evidence: `first-class-edges-arc` on the live store, read 2026-08-06 — three parked entries whose own text reads "(increment 1, UNCONDITIONAL)", "(increment 2, UNCONDITIONAL)", and "the report half depends on nothing and can go first"; increment log #1180 (decision landed, no code), then #1183 and #1184 the same day. ADR-0288's own evidence: 16/19 chips within four minutes of their own merge, 25/25 clicked / 0 dismissed. The retired-metric finding: closing note of `factory-self-load-tune-the-guidance-loop-back-to-evidence-arc`, 2026-08-04. - Library: `asset:session-cutting` (the dispatch mechanism), `asset:merge-ceremony` step 9(d), `session-orchestrator` step 6(d) — the two artifacts D6 changes. - Arc: **none.** The arcs that own session-lifecycle discipline — `end-at-merge-arc` (ADR-0271/0275/ 0303) and `factory-self-load-tune-the-guidance-loop-back-to-evidence-arc` (ADR-0288) — are both closed, and no live arc produced this decision; an owner correction did. Stamped arc-less rather than reopening a closed arc or mis-homing on a live one (precedent: ADR-0309, ADR-0315). A successor that wants this territory should charter it rather than inherit it. |
| ADR-0320 | accepted | ADR-0260 | accepted | _(no block in the amender's Status)_ |
| ADR-0322 | accepted | ADR-0305 | accepted | _(no block in the amender's Status)_ |
| ADR-0324 | accepted | ADR-0095 | accepted | _(no block in the amender's Status)_ |
| ADR-0324 | accepted | ADR-0139 | accepted | _(no block in the amender's Status)_ |
| ADR-0325 | accepted | ADR-0182 | accepted | _(no block in the amender's Status)_ |
| ADR-0326 | accepted | ADR-0212 | accepted | **Amends** ADR-0212 — it replaces ONE clause, the join key. ADR-0212's three channels (position = stage, colour = intent, motion = build phase), its build-wisp retirement, the ADR-0138 §5 honesty wall it restates, and its ADR-0048/0138/0200 amendments are untouched and stay current. |
| ADR-0328 | accepted | ADR-0323 | accepted | _(no block in the amender's Status)_ |
| ADR-0329 | accepted | ADR-0288 | accepted | _(no block in the amender's Status)_ |
| ADR-0329 | accepted | ADR-0319 | accepted | _(no block in the amender's Status)_ |
| ADR-0330 | accepted | ADR-0323 | accepted | _(no block in the amender's Status)_ |
| ADR-0332 | accepted | ADR-0331 | accepted | _(no block in the amender's Status)_ |
| ADR-0333 | superseded | ADR-0332 | accepted | _(no block in the amender's Status)_ |
| ADR-0334 | accepted | ADR-0332 | accepted | _(no block in the amender's Status)_ |
| ADR-0335 | accepted | ADR-0239 | accepted | **Amends** ADR-0239 — narrows its "closure is never derived, always explicit" line to the specific signal ADR-0239 measured and rejected (plan state), not the one this ADR derives from (increment state). ADR-0239's own `arc close` verb, its owner-only re-open discipline for an EXPLICIT close, and its "status is a projection of prose" principle all stand; what changes is that a SECOND, narrower closure signal now exists alongside the explicit one, and it can also open the arc back up again mechanically. **Amends** ADR-0305 — adds a birth invariant (an arc is never observably at zero increments) that ADR-0305's `arc new` did not carry, and gives the increment tier's own status field (`proposal` / `ready` / `active` / `closed`) a second reader: the arc's own `lifecycle`. |
| ADR-0335 | accepted | ADR-0305 | accepted | **Amends** ADR-0305 — adds a birth invariant (an arc is never observably at zero increments) that ADR-0305's `arc new` did not carry, and gives the increment tier's own status field (`proposal` / `ready` / `active` / `closed`) a second reader: the arc's own `lifecycle`. |
| ADR-0336 | accepted | ADR-0311 | accepted | **Amends** ADR-0311. ADR-0311 D2 retired `check:web-experience` and D5 requires that any re-addition "requires only explicit root-script, gate-plan and CI wiring, but ... also requires new production-catch evidence and an ADR." This decision is that ADR for one narrow slice of the retired rung; ADR-0311's nine-survivor set and its retirement of the other fifteen rungs (including the remaining two-thirds of `check:web-experience` itself) stay current and are not reopened. |
| ADR-0337 | accepted | ADR-0239 | accepted | **Amends** ADR-0239 — D2's second paragraph reserved `closed → active` for the owner; that reservation is withdrawn and the transition is given the verb it never had. D2's first paragraph — a lifecycle bit is a projection of prose that supports it, never a free flip — is untouched and is extended to the opening direction. D1, D3, D4 and D5 are untouched. |
| ADR-0337 | accepted | ADR-0335 | accepted | **Amends** ADR-0335 — its D3 ends *"Re-opening a CLOSED-BY-`arc close` arc still has no bare verb"*; this ADR adds one, and D3 is corrected in place accordingly. **Nothing else in ADR-0335 changes**: lifecycle stays derived from increment state, the recompute still runs after every increment write, parking work is still the ordinary way an arc reopens, and the zero-increment birth invariant is untouched. |
| ADR-0340 | accepted | ADR-0332 | accepted | _(no block in the amender's Status)_ |
| ADR-0340 | accepted | ADR-0334 | accepted | _(no block in the amender's Status)_ |
| ADR-0341 | accepted | ADR-0340 | accepted | _(no block in the amender's Status)_ |
| ADR-0342 | accepted | ADR-0341 | accepted | _(no block in the amender's Status)_ |
| ADR-0343 | accepted | ADR-0342 | accepted | _(no block in the amender's Status)_ |
| ADR-0344 | accepted | ADR-0332 | accepted | _(no block in the amender's Status)_ |
| ADR-0345 | accepted | ADR-0344 | accepted | _(no block in the amender's Status)_ |
| ADR-0346 | accepted | ADR-0138 | accepted | _(no block in the amender's Status)_ |
| ADR-0346 | accepted | ADR-0200 | accepted | **Amends** ADR-0200 — the one ledger, the three grades and the per-`(unit_id, session_id)` row all stand; what changes is that `waiting` acquires the meaning its Status prose always claimed (*"push all other sessions to wait in line"*), and D2's free-prose `intent` splits. **Amends** ADR-0138 — its Decision 2 serialisation is restored, at capability rather than story grain; its Decision 5 honesty wall (a claim is never a proof) is untouched and remains binding. |
| ADR-0346 | accepted | ADR-0270 | accepted | **Amends** ADR-0270 — its D1 (capability grain) STANDS and is the premise this builds on; its D2 (*"proceeds or re-plans on its own judgment"*) is reversed by D1 here, and the option (a) it rejected is taken at the narrower grain. **Amends** ADR-0200 — the one ledger, the three grades and the per-`(unit_id, session_id)` row all stand; what changes is that `waiting` acquires the meaning its Status prose always claimed (*"push all other sessions to wait in line"*), and D2's free-prose `intent` splits. **Amends** ADR-0138 — its Decision 2 serialisation is restored, at capability rather than story grain; its Decision 5 honesty wall (a claim is never a proof) is untouched and remains binding. |
| ADR-0347 | accepted | ADR-0335 | accepted | _(no block in the amender's Status)_ |
| ADR-0348 | accepted | ADR-0294 | accepted | _(no block in the amender's Status)_ |
| ADR-0348 | accepted | ADR-0295 | accepted | _(no block in the amender's Status)_ |
| ADR-0349 | accepted | ADR-0314 | accepted | _(no block in the amender's Status)_ |
| ADR-0350 | accepted | ADR-0006 | accepted | **Amends** ADR-0006 — which established the event store as the single source of truth and split v1's fused grain into an append-only log under a derived rollup. All of that stands. What ADR-0006 never settled is whether an event records **what caused it**; it left "event vocabulary — OTel-GenAI vs bespoke" open in its own `## Open` section, and this decision closes one clause of that question without reopening the rest. |
| ADR-0351 | accepted | ADR-0314 | accepted | _(no block in the amender's Status)_ |
| ADR-0353 | accepted | ADR-0122 | accepted | _(no block in the amender's Status)_ |
| ADR-0355 | superseded | ADR-0257 | accepted | **Amends** ADR-0257 D2/D3/D7 and ADR-0284 D1/D6/D8. The owner has now chosen and funded the Codex-only containment thread those decisions left as a scope-and-spend fork. For interactive Codex, ADR-0284's accepted worktree-to-worktree risk no longer applies: Codex receives authority over one current claimed worktree, not every registered worktree. Claude's static lobby wall and its accepted residual sibling-worktree risk are unchanged. |
| ADR-0355 | superseded | ADR-0284 | accepted | _(no block in the amender's Status)_ |
| ADR-0356 | accepted | ADR-0232 | accepted | **Amends** ADR-0232 D4 and its exact-one-file consequences. Codex still authors only in a disposable replica and the spine remains the sole promotion/proof/signing authority; the promotion manifest is widened from one exact path to one explicit finite set of exact paths. |
| ADR-0357 | accepted | ADR-0348 | accepted | _(no block in the amender's Status)_ |
| ADR-0359 | accepted | ADR-0314 | accepted | **Amends** ADR-0314 — the briefing panel (D3) keeps its purpose and its click-through, but its four blocks stop being four equal blocks: two lead, two fold. It also widens D5's authored-briefing shape by one field. It overturns nothing: `blocked` stays unlit (D4), the panel stays read-only (D9), and the lane states are untouched. |
| ADR-0360 | accepted | ADR-0235 | accepted | _(no block in the amender's Status)_ |
| ADR-0360 | accepted | ADR-0260 | accepted | _(no block in the amender's Status)_ |
| ADR-0360 | accepted | ADR-0320 | accepted | _(no block in the amender's Status)_ |
| ADR-0361 | accepted | ADR-0352 | accepted | _(no block in the amender's Status)_ |
| ADR-0362 | accepted | ADR-0304 | accepted | _(no block in the amender's Status)_ |
| ADR-0362 | accepted | ADR-0334 | accepted | _(no block in the amender's Status)_ |
| ADR-0362 | accepted | ADR-0345 | accepted | _(no block in the amender's Status)_ |
| ADR-0363 | accepted | ADR-0223 | accepted | _(no block in the amender's Status)_ |
| ADR-0364 | superseded | ADR-0355 | superseded | _(no block in the amender's Status)_ |
| ADR-0365 | accepted | ADR-0223 | accepted | _(no block in the amender's Status)_ |
| ADR-0366 | accepted | ADR-0271 | accepted | _(no block in the amender's Status)_ |
| ADR-0367 | accepted | ADR-0280 | accepted | _(no block in the amender's Status)_ |
| ADR-0367 | accepted | ADR-0274 | accepted | _(no block in the amender's Status)_ |
| ADR-0368 | superseded | ADR-0355 | superseded | _(no block in the amender's Status)_ |
| ADR-0369 | accepted | ADR-0192 | accepted | _(no block in the amender's Status)_ |
| ADR-0370 | accepted | ADR-0366 | accepted | _(no block in the amender's Status)_ |
| ADR-0371 | accepted | ADR-0301 | accepted | _(no block in the amender's Status)_ |
| ADR-0372 | proposed | ADR-0317 | accepted | **Amends** ADR-0317. D2 shipped the `sourceOwnership.subtrees` map REPORT-ONLY and set an explicit forward bar: *"ADR-0311 retired sixteen gate rungs for want of evidence, so the blocking rung must still earn its place on the report's own numbers before it lands."* That bar is now cleared, on the evidence in Context below. Nothing else in ADR-0317 is reopened: the map stays declared-not-derived, subtree-grain, and `storytree ownership` itself keeps exiting 0 regardless of what it finds — this decision adds a second, narrower, separately-wired instrument that reads the same map, exactly the shape ADR-0336 used for `check:web-experience-closure`. |
| ADR-0372 | proposed | ADR-0311 | accepted | **Amends** ADR-0311. D5 requires that any check joining the gate beyond the nine audited survivors clear a fresh evidence bar and get its own ADR. `check:ownership-totality` is not a re-admission of any of the sixteen D2 retired — the map it reads did not exist at that audit — so it is a new rung under D5's general rule, following the precedent ADR-0336 already set for `check:web-experience-closure`. |
| ADR-0373 | accepted | ADR-0223 | accepted | _(no block in the amender's Status)_ |
| ADR-0374 | accepted | ADR-0335 | accepted | _(no block in the amender's Status)_ |
| ADR-0374 | accepted | ADR-0351 | accepted | _(no block in the amender's Status)_ |
| ADR-0375 | superseded | ADR-0368 | superseded | _(no block in the amender's Status)_ |
| ADR-0376 | accepted | ADR-0276 | superseded | _(no block in the amender's Status)_ |
| ADR-0377 | accepted | ADR-0298 | accepted | **Amends** ADR-0298 D6 — sharpens what "owns" means (surface, not theme). It does not overturn D6's shape: fold-if-owned, charter-if-not was always the rule. |
| ADR-0379 | superseded | ADR-0375 | superseded | _(no block in the amender's Status)_ |
| ADR-0380 | accepted | ADR-0069 | accepted | _(no block in the amender's Status)_ |
| ADR-0380 | accepted | ADR-0219 | accepted | _(no block in the amender's Status)_ |
| ADR-0380 | accepted | ADR-0230 | accepted | _(no block in the amender's Status)_ |
| ADR-0380 | accepted | ADR-0280 | accepted | _(no block in the amender's Status)_ |
| ADR-0380 | accepted | ADR-0367 | accepted | _(no block in the amender's Status)_ |
| ADR-0381 | accepted | ADR-0355 | superseded | _(no block in the amender's Status)_ |
| ADR-0381 | accepted | ADR-0364 | superseded | _(no block in the amender's Status)_ |
| ADR-0382 | accepted | ADR-0377 | accepted | **Amends** ADR-0377 D3, D4 and D5 — withdraws the numeric increment cap, its at-the-cap refusal, and the no-grandfather-clause bullet. It does not touch D1 or D2: the surface-ownership floor and the charter-a-new-arc fallback stand exactly as ADR-0377 left them. |
| ADR-0383 | accepted | ADR-0288 | accepted | **Amends** ADR-0288 — D3's requirement that every follow-up be named in the debrief (chipped-and-named, or considered-and-declined with a one-line reason) is withdrawn as a DELIVERY requirement. What survives verbatim is D3's core: a concern may not be dropped in silence. What changes is where it goes — into an object, not into a paragraph. D1/D2/D5's worth-a-session bar is untouched. |
| ADR-0384 | accepted | ADR-0305 | accepted | _(no block in the amender's Status)_ |
| ADR-0384 | accepted | ADR-0358 | accepted | _(no block in the amender's Status)_ |
| ADR-0385 | accepted | ADR-0226 | accepted | _(no block in the amender's Status)_ |
| ADR-0386 | accepted | ADR-0384 | accepted | _(no block in the amender's Status)_ |
| ADR-0388 | accepted | ADR-0140 | accepted | _(no block in the amender's Status)_ |
| ADR-0388 | accepted | ADR-0146 | accepted | _(no block in the amender's Status)_ |
| ADR-0390 | accepted | ADR-0255 | accepted | **Amends** ADR-0255, ADR-0257, ADR-0284 and ADR-0381. The first three stay current for the static Claude file-tool wall and the shared-checkout incident they answer, but their harness-neutral and Codex-specific mechanical write-authority clauses no longer bind interactive Codex. ADR-0381's exercise-first direction and evidenced-hazard bar stand, while its instruction to keep the existing fence does not. For Codex, claims survive as coordination and the standard landing ceremony, not as a filesystem grant. |
| ADR-0390 | accepted | ADR-0257 | accepted | _(no block in the amender's Status)_ |
| ADR-0390 | accepted | ADR-0284 | accepted | _(no block in the amender's Status)_ |
| ADR-0390 | accepted | ADR-0381 | accepted | _(no block in the amender's Status)_ |
| ADR-0391 | accepted | ADR-0387 | accepted | _(no block in the amender's Status)_ |
| ADR-0392 | accepted | ADR-0070 | accepted | _(no block in the amender's Status)_ |
| ADR-0393 | accepted | ADR-0354 | accepted | _(no block in the amender's Status)_ |
| ADR-0394 | accepted | ADR-0195 | accepted | _(no block in the amender's Status)_ |
| ADR-0394 | accepted | ADR-0304 | accepted | _(no block in the amender's Status)_ |
| ADR-0395 | accepted | ADR-0038 | accepted | **Amends** ADR-0038, ADR-0040, ADR-0085, ADR-0092, ADR-0094, ADR-0097, and ADR-0296. Their standing decisions remain current: growth carries lifecycle, only signed proof paints green, genuine brownfield adoption runs brown → proposed → green, author-declared reliability gates and gate-as-proof remain valid authoring mechanisms, status selects the appropriate go-green path, and capability-level `unhealthy` remains outside the rendered vocabulary. This ADR narrows the brown rung to provenance, replaces the generic missing-proof → brown fallback, withdraws ADR-0092/0094's application of the brownfield path to Storytree's greenfield `library` story, and corrects ADR-0085's two foundational ports from `mapped` to `proposed` without withdrawing their observe-gate path to signed green. |
| ADR-0395 | accepted | ADR-0040 | accepted | _(no block in the amender's Status)_ |
| ADR-0395 | accepted | ADR-0085 | accepted | _(no block in the amender's Status)_ |
| ADR-0395 | accepted | ADR-0092 | accepted | _(no block in the amender's Status)_ |
| ADR-0395 | accepted | ADR-0094 | accepted | _(no block in the amender's Status)_ |
| ADR-0395 | accepted | ADR-0097 | accepted | _(no block in the amender's Status)_ |
| ADR-0395 | accepted | ADR-0296 | accepted | _(no block in the amender's Status)_ |
| ADR-0396 | accepted | ADR-0294 | accepted | _(no block in the amender's Status)_ |
| ADR-0397 | accepted | ADR-0328 | accepted | _(no block in the amender's Status)_ |
| ADR-0398 | accepted | ADR-0392 | accepted | _(no block in the amender's Status)_ |
| ADR-0399 | accepted | ADR-0394 | accepted | _(no block in the amender's Status)_ |
| ADR-0401 | accepted | ADR-0162 | accepted | _(no block in the amender's Status)_ |
| ADR-0402 | accepted | ADR-0223 | accepted | _(no block in the amender's Status)_ |
| ADR-0403 | accepted | ADR-0139 | accepted | _(no block in the amender's Status)_ |
| ADR-0403 | accepted | ADR-0223 | accepted | _(no block in the amender's Status)_ |
| ADR-0403 | accepted | ADR-0311 | accepted | _(no block in the amender's Status)_ |
| ADR-0404 | accepted | ADR-0090 | accepted | _(no block in the amender's Status)_ |
| ADR-0404 | accepted | ADR-0094 | accepted | _(no block in the amender's Status)_ |
| ADR-0404 | accepted | ADR-0097 | accepted | _(no block in the amender's Status)_ |
| ADR-0404 | accepted | ADR-0133 | accepted | _(no block in the amender's Status)_ |
| ADR-0404 | accepted | ADR-0136 | accepted | _(no block in the amender's Status)_ |
| ADR-0404 | accepted | ADR-0144 | accepted | _(no block in the amender's Status)_ |
| ADR-0404 | accepted | ADR-0155 | accepted | _(no block in the amender's Status)_ |
| ADR-0405 | accepted | ADR-0295 | accepted | _(no block in the amender's Status)_ |
| ADR-0405 | accepted | ADR-0348 | accepted | _(no block in the amender's Status)_ |
| ADR-0406 | accepted | ADR-0367 | accepted | **Amends** ADR-0367 — D5's rule ("the land's status tint survives, and it outranks the art") is scoped to art that REPRESENTS WORK. It is untouched for the product map. It does not bite on the `packages/forest-world-r3f/harness/` experiment surface, because that surface asserts no proof state for an art choice to misreport. |
| ADR-0408 | accepted | ADR-0097 | accepted | _(no block in the amender's Status)_ |
| ADR-0408 | accepted | ADR-0405 | accepted | _(no block in the amender's Status)_ |
| ADR-0409 | accepted | ADR-0348 | accepted | _(no block in the amender's Status)_ |
| ADR-0409 | accepted | ADR-0357 | accepted | _(no block in the amender's Status)_ |
| ADR-0410 | accepted | ADR-0070 | accepted | **Amends** ADR-0070, ADR-0357 — it narrows the SEQUENCING half of the two-stage visual proof and leaves the judging half untouched. ADR-0070's two stages stand exactly as written; what changes is that stage 2 no longer has to arrive before the capability's green. ADR-0357 deliberately left the capability tier out of scope and named this an owner question that must not be settled by analogy — this ADR is that question being answered by the owner, not the analogy ADR-0357 forbade. |
| ADR-0410 | accepted | ADR-0357 | accepted | _(no block in the amender's Status)_ |
| ADR-0411 | accepted | ADR-0275 | accepted | **Amends** ADR-0275 — it deletes ONE of D2's four hard ends (the roughly-three-continuations count) and replaces D1 Axis 2's self-estimated "useful room" with a read number. The other three hard ends stand verbatim, and every other clause of ADR-0275 — Axis 1's mechanical fresh-worktree rule, D3, D4's revert rule, D5's reaper gap — is untouched. |
| ADR-0413 | accepted | ADR-0248 | accepted | **Amends** ADR-0248 — it CONFIRMS D1's scope rather than widening it, and adds the two things D1 did not carry: a permanent rejection of one candidate widening, and a stated trigger for the other. |
| ADR-0414 | accepted | ADR-0367 | accepted | **Amends** ADR-0367, ADR-0392 — it settles for the SHIPPED map the question ADR-0367 D5 left open (whether art that asserts no state may appear beside art that does), and it answers two of the semantic calls ADR-0392 D5 reserved to the owner. Neither is overturned: D5's reservation stands for every call not answered here, and ADR-0392 D2's grant of intermediate appearance calls to agents is untouched. |
| ADR-0414 | accepted | ADR-0392 | accepted | _(no block in the amender's Status)_ |
| ADR-0416 | accepted | ADR-0016 | accepted | _(no block in the amender's Status)_ |
| ADR-0416 | accepted | ADR-0040 | accepted | _(no block in the amender's Status)_ |
| ADR-0416 | accepted | ADR-0083 | accepted | _(no block in the amender's Status)_ |
| ADR-0416 | accepted | ADR-0105 | accepted | _(no block in the amender's Status)_ |
| ADR-0416 | accepted | ADR-0296 | accepted | _(no block in the amender's Status)_ |
| ADR-0416 | accepted | ADR-0395 | accepted | _(no block in the amender's Status)_ |
| ADR-0417 | accepted | ADR-0097 | accepted | _(no block in the amender's Status)_ |
| ADR-0417 | accepted | ADR-0405 | accepted | _(no block in the amender's Status)_ |
| ADR-0417 | accepted | ADR-0408 | accepted | _(no block in the amender's Status)_ |
| ADR-0418 | accepted | ADR-0380 | accepted | _(no block in the amender's Status)_ |
| ADR-0418 | accepted | ADR-0406 | accepted | _(no block in the amender's Status)_ |
| ADR-0418 | accepted | ADR-0415 | accepted | _(no block in the amender's Status)_ |
| ADR-0419 | superseded | ADR-0139 | accepted | **Amends** ADR-0139 — D4 required the in-place annotation and left the judgment to the librarian, caught on a reviewed PR. The measurement below shows that floor is not holding. A mechanical presence check is added beneath the editorial judgment; the judgment itself is unchanged. |
| ADR-0419 | superseded | ADR-0402 | accepted | **Amends** ADR-0402 — D2 kept `amends` and `supersedes` unrenamed on the grounds that they "mean more than depends on", and recorded the asymmetry so a later pass would not finish the job for consistency's sake. That reasoning is upheld, not reversed. What this ADR narrows is what `amends` is permitted to CONTAIN: an edge that changed nothing in its target never met D2's definition and is a plain support edge wearing the wrong name. |
| ADR-0419 | superseded | ADR-0403 | accepted | **Amends** ADR-0403 — dec 6 made the depth walk `amends`-only. Decisions now carry `dependsOn` (dec 4) and it is a genuine support edge, so it joins the depth side. The never-sum fence is untouched: `supersedes` remains excluded by the SHAPE of `decision-amends-seam.ts`, which has no `supersedesOf` and no edge-type parameter. |
| ADR-0421 | accepted | ADR-0405 | accepted | _(no block in the amender's Status)_ |
| ADR-0422 | accepted | ADR-0404 | accepted | **Amends** ADR-0404 — decision **6** only. D6 declares the build ENGINE out of scope and names `routedBuildRunner` among the things that "stay exactly as they are … as CODE; nothing here is deleted". D1 narrows that sentence to `nodeBuild` / `storyBuild` / `runAdopt` (plus the prove-it-gate, verdict signing and the CLI verbs, all untouched), and lifts the fence over `routedBuildRunner`, `BuildRegistry`, `runBuildJob` and `adoptRunnerFromAdoptStory`. D6 itself left the door open — *"Orphan-vs-delete remains a separate call, not taken here"* — and this is that call. Nothing else in ADR-0404 moves: its D1–D5 and D7–D8 stand verbatim, and the reversal it describes is unaffected. |
| ADR-0422 | accepted | ADR-0133 | accepted | **Amends** ADR-0133 — decision **3**, its RELOCATION half. ADR-0404 already retired that decision's MOUNT half; D1 below retires the other, because the code the relocation produced is deleted. Decision 3 is now spent in both halves and nothing of it survives as code, so reading ADR-0133 alone would tell you the build worker lives in `@storytree/drive`. Annotated there in place. ADR-0133's decisions 1, 2 and 4 are untouched — the desktop is still the priority surface. |
| ADR-0423 | accepted | ADR-0417 | accepted | **Amends** ADR-0417 — **D4's second sentence.** D4 made resuming an adoption from authored `proposed` conditional on building a durable, queryable adoption-entry marker, and left "fail closed" as the interim. Reading D4 alone therefore sends a reader off to design that marker. It should not: the resume capability is already decomposed into two verbs that carry no status guard, so the marker is not merely unbuilt, it is **unnecessary**, and "fail closed" is the permanent answer rather than a holding position. D4's first sentence (a fresh adoption entry accepts only `mapped`) is unchanged and is what this builds. |
| ADR-0427 | accepted | ADR-0419 | superseded | **Amends** ADR-0419 — **Decision 4 is RETIRED.** D4 decided two things in one sentence: that an accepted `amends` edge obliges an in-place annotation on its target, and that *"a gate rung enforces the presence of one"*. Only the second half retires. The obligation is untouched and still binds; the mechanical presence check beneath it, and the promise to enable it once the backlog reached zero, are withdrawn. D4's own declared limit — *"it catches ABSENCE, never THINNESS"* — is the reason, read as a verdict on the instrument rather than as a caveat on it. Every other decision in ADR-0419 stands: D1's walk over both support edges, D2's deprecation of `amends` for plain support, D3's deprecation-not-flag-day order, and D5's deferred evidence-gated question. |
| ADR-0430 | accepted | ADR-0207 | accepted | **Amends** ADR-0207 — **retires D3's blanket invariant** that "storytree never handles Claude credentials … the credential never passes through storytree code, at install, at runtime, ever", and with it D3's sanctioned arrangement in which the dev runs `claude setup-token` themselves and keeps the result in *their own* `~/.storytree/secrets.json`. Under this decision storytree code DOES fetch and hydrate a Claude credential, from a vault the running identity already holds access to. D3's remaining clauses (the wizard *instructs*, Cursor deferred, all-in on the Claude path) are untouched, as are D1, D2, D4, D5 and D6. This also answers, rather than reverses, ADR-0207's own Consequences note that three sign-ins were "accepted as the cost of the three genuinely separate trust domains" pending evidence on whether collapsing them was worth pursuing. |
