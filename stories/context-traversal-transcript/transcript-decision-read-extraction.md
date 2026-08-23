---
id: "transcript-decision-read-extraction"
tier: capability
story: context-traversal-transcript
arc: linked-session-context-arc
title: "A host transcript yields the decision-record reads it already recorded, by argv shape"
outcome: "Every decision-record read a host transcript recorded is recovered by argv shape, with each near-miss declined and counted rather than dropped."
status: mapped
proof_mode: integration-test
depends_on: []
decisions: [235, 403]
# DELIVERED AND GREEN, BUT NOT SPINE-PROVEN — read this before treating the unit as adoptable.
# `packages/context-traversal-transcript/src/decision-reads.ts` and its 21-case companion suite exist
# at HEAD and pass under `pnpm --filter @storytree/context-traversal-transcript test`. They were landed
# by an ORDINARY hand-authored commit (e936eb17, "feat(traversal): recover the decision-record read
# history from host transcripts", under `adrs-into-the-dag-arc-inc-07`), NOT by a `--real` build. The
# planned red was therefore never observed by storytree's spine and NO SIGNED VERDICT BACKS THIS
# CAPABILITY. `status: mapped` records exactly that: the code is real, the proof is real, the spine's
# observation of a red→green transition is absent. `proposed` would be the false claim, because it
# would advertise a greenfield unit the spine is expected to drive.
#
# THERE IS DELIBERATELY NO `real:` ARM (ADR-0094). Registering one would invite a net-new `--real`
# drive against files that already exist, whose CONFIRM_RED could only be manufactured — the theater
# ADR-0085 bans and ADR-0097 §2 re-affirms. The spec-borne `proof.command` below is what binds this
# capability to an observing command; a future adoption runs it and OBSERVES green (the ADR-0085
# brownfield route), it does not re-drive it.
#
# This capability was MINTED, not built, by `linked-session-context-arc-inc-28` — the files were
# knowingly declared at story grain by the increment that wrote them, which was fenced to
# ingest-and-report, leaving `repo-manifest.json` a standing note that a finer owner was owed. Minting
# it makes the subtree claimable at `work` grade again (ADR-0346 D2 retired story-grain work claims).
# No contract below invents an obligation: each states what a SHIPPED test already asserts.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-transcript", "test"]
  scope:
    testGlobs: ["packages/context-traversal-transcript/src/decision-reads.test.ts"]
    sourceGlobs: ["packages/context-traversal-transcript/src/decision-reads.ts"]
---

# A host transcript yields the decision-record reads it already recorded, by argv shape

**Outcome —** Every decision-record read a host transcript recorded is recovered by argv shape, with
each near-miss declined and counted rather than dropped.

## Guidance

**What this capability owns.** `packages/context-traversal-transcript/src/decision-reads.ts` — the
extractor, and nothing downstream of it. It reads transcript bytes and returns a
`DecisionReadScan`; it writes nothing, resolves no directory, and touches no trace. The batch write
that turns its output into durable events is the sibling `transcript-decision-read-ingest`.

**Why it exists.** `observeCliInvocation` is an allowlist over `storytree` argv, and `adr` was not on
it — nor could it have been, because until ADR-0403 there was no read verb for a decision record: an
agent that wanted ADR-0223 opened `docs/decisions/0223-….md` with the ordinary file tool. So zero
decision reads had ever reached a traversal trace, while roughly a third of every reading list the
corpus hands an agent points into the decision log. The harness had been writing all of them down the
whole time, in the same transcript files `correlate-transcripts.ts` already scans for occupancy. This
module is the missing extractor.

**Two routes reach a decision, and both are recognised by ARGV SHAPE.** ADR-0403 dec 1 made a decision
an ordinary Library row and deleted `docs/decisions/` whole, so a file-path matcher is a matcher whose
SUBJECT MOVED — from that commit it can only ever return zero, and a zero from an extractor reads
exactly like a session that consulted no decision. The two live shapes are
`storytree library artifact adr-NNNN` (the row) and `storytree adr pull <n>` (the whole document); the
three historical file shapes (`Read`, `Grep`, and a shell read verb over `docs/decisions/NNNN-slug.md`)
are still recovered, because the record they are recovering is historical.

**The id token alone is NEVER a read, and that is measured rather than cautious.** Over 3,346
transcripts on this disk a bare `adr-NNNN` / `ADR-NNNN` substring appears in 2,580 commands that read
no decision at all — an `echo`, an `arc increment close --note`, a commit message — against 39 that
actually read one. A loose matcher would have recorded sixty-six false reads for every true one and
called the result a recovery. A mention is therefore counted as a MENTION, which is what lets a zero
be told apart from a blind instrument (contract 18).

**The two id spellings are deliberately NOT unified here.** A file-shaped read mints
`doc:decisions/NNNN-slug.md` and a store-shaped read mints `adr-NNNN`. Rewriting historical ids would
break the idempotence the ingest rests on, so they are reconciled at READ time by
`decision-read-coverage.ts` instead, through the single resolution point ADR-0403 dec 7 insists on.

**Fences that hold at HEAD.** The four-digit decision-id guard is strict, and it delegates to
`@storytree/library`'s `adrDocId` / `adrNumberOfArtifactId` rather than carrying a second copy —
ADR-0403 dec 7 makes that the ONE place the rule may live. The scan never throws. It reads no
transcript CONTENT into its result: prompts, message text, tool inputs and tool results stay out
(ADR-0235 clause 6). It resolves no directory and reads no environment, so every test is
HOME-independent.

## Contracts

Each contract id below is the lead token of the `test(...)` title that proves it in
`packages/context-traversal-transcript/src/decision-reads.test.ts`, per the house
`test("<contract-id>: <prose>")` convention.

1. **`node-id-is-the-corpus-doc-pointer-form`**
   - **asserts —** `decisionNodeIdsInPath` returns the corpus's own `doc:decisions/NNNN-slug.md`
     pointer form from every spelling of a decision path that reaches a transcript: a Windows
     absolute path with backslash separators
     (`C:\code\storytree\.claude\worktrees\wt\docs\decisions\0403-….md`), a repo-relative
     `docs/decisions/0223-a-thing.md`, and a bare `./decisions/0001-foundational-stack.md` with no
     `docs/` parent — each yielding exactly one id.
   - **falsifiability —** goes red against an implementation emitting the raw absolute path, dropping
     the `doc:` scheme, preserving the Windows `\` separator in the id, reducing the id to a bare
     number or to `adr-0403`, requiring a `docs/` parent segment, or returning duplicates.
2. **`a-non-decision-path-is-never-recorded-as-a-decision-read`**
   - **asserts —** five paths each yield `[]`: an ordinary source file
     (`packages/library/src/knowledge.ts`), an ordinary markdown file under `.claude/projects/memory`,
     a `decisions` substring that is not at a segment boundary (`docs/mydecisions/0001-a.md`), a
     two-digit number (`docs/decisions/12-a.md`), and a non-`.md` extension
     (`docs/decisions/0012-a.txt`).
   - **falsifiability —** goes red against any loosening of the matcher: dropping the left token
     boundary so `mydecisions/` matches, using `\d+` instead of `\d{4}`, or not anchoring the
     extension to `.md`. These three near-misses are the named negatives and must stay out.
3. **`a-shell-read-is-recovered-from-a-later-segment`**
   - **asserts —** `scrapeShellDecisionReads("cd /home/dev/code/storytree && cat docs/decisions/0139-….md")`
     recovers the read from the SECOND `&&` segment — the commonest shape on disk — and records NO
     decline for the leading `cd`: `nodeIds` is the one id and `declinedVerbs` is empty.
   - **falsifiability —** goes red against an implementation that classifies a whole command by its
     first verb, which yields no id and a spurious `cd` decline, and against one that recovers the
     path but still records a decline for the navigation segment.
4. **`every-claimed-read-verb-yields-its-path`**
   - **asserts —** every verb the scraper claims as a read actually yields its path: `sed -n '1,60p'`,
     `head -20`, and a `grep -n 'status'` naming TWO decision records in one segment, which yields
     both ids in argv order.
   - **falsifiability —** goes red against omitting `sed`, `head` or `grep` from the read-verb set,
     against treating a non-in-place `sed -n` as a write, and against stopping at the first path match
     in a segment so the two-path `grep` returns only one id.
5. **`a-shell-write-is-declined-and-counted-by-verb`**
   - **asserts —** a segment that WRITES a decision record records no read and is counted BY VERB:
     `sed -i 's/a/b/' docs/decisions/0386-a-thing.md` yields no id and `declinedVerbs: ["sed"]`, and
     `git add docs/decisions/0386-a-thing.md` yields no id and `declinedVerbs: ["git"]`.
   - **falsifiability —** goes red against admitting `sed` unconditionally (so `sed -i` mints a read),
     against admitting `git` to the read-verb set, and against declining correctly but silently — an
     empty `declinedVerbs`, or a differently-spelled verb such as `"sed -i"`, fails.
6. **`a-redirect-target-is-authoring-never-reading`**
   - **asserts —** a decision record that is a `>` redirect TARGET is a file being authored: a
     `cat > docs/decisions/0386-a-thing.md <<'ADREOF'` heredoc yields no id, and `redirectTargets`
     is exactly 1 — the drop is counted, not silent.
   - **falsifiability —** goes red against ignoring `>` / `>>` and minting the id because the leading
     verb `cat` is a read verb, against suppressing the path while leaving `redirectTargets` at 0, and
     against a redirect check that inspects only the match index rather than walking back to the start
     of the whole path token (the `decisions` match sits mid-token, after `docs/`).
7. **`a-heredoc-body-is-never-scraped`**
   - **asserts —** a `gh pr create --body-file - <<'PRBODY'` heredoc whose BODY names two decision
     records — one of them behind the word `cat` — yields no ids at all. Authored prose that merely
     mentions a decision record is not a read of one.
   - **falsifiability —** goes red against scraping heredoc bodies while also locating the read verb
     anywhere in a segment rather than at its head, which recovers the `and supersedes cat …` line,
     and against any implementation that mints a read from a path merely appearing in text.
8. **`session-identity-mirrors-derive-identity-rule-one`**
   - **asserts —** `sessionIdFromCwd` mirrors `deriveIdentity()` rule 1 exactly: a deeper
     backslash-separated worktree path and its forward-slash twin both resolve to `agent-abc`; the
     PRIMARY CHECKOUT `C:\code\storytree` resolves to `undefined`; and
     `/home/dev/.claude/notes/worktrees/agent-abc`, where `.claude` and `worktrees` are not
     CONSECUTIVE segments, also resolves to `undefined`.
   - **falsifiability —** goes red against failing to normalise backslashes, against returning the
     last path segment rather than the one following `worktrees`, against inventing any identity for
     the lobby, and against matching `.claude` and `worktrees` non-adjacently. The last two are the
     named negatives.
9. **`each-read-shape-carries-its-own-surface-and-sidechain-reads-stay-under-the-parent`**
   - **asserts —** over a realistic ten-line transcript, `scanTranscriptDecisionReads` yields exactly
     six reads in order, each with its own shape and surface — two `read`, one `grep`, one `shell`
     (recovered from a `cd … && sed -n` segment) and two `cli` (one `library artifact adr-0301`, one
     `adr pull 380`) — with the SIDECHAIN read kept under the PARENT `sessionId` rather than given one
     of its own. In the same scan a lobby-cwd read contributes `uncorrelatedReads: 1`, the first read's
     `at` is preserved verbatim, an `arc increment close --note "Dropped: ADR-0306 D3 …"` contributes
     `decisionMentions: 1`, and `DECISION_READ_SURFACES` holds four distinct values.
   - **falsifiability —** goes red against dropping sidechain lines or re-attributing them to a session
     of their own, against flattening the four shapes to one label, against recording the `Grep` over
     the DIRECTORY `docs/decisions` or the ordinary source read beside it, against attributing the
     lobby read to a session instead of counting it uncorrelated, against minting a read from the
     ADR-0306 `--note` mention, and against unifying the `doc:` and `adr-` id forms.
10. **`a-tool-call-with-no-id-is-skipped-and-counted`**
    - **asserts —** a `tool_use` block carrying a valid decision path but NO `id` field yields no read
      and `unidentifiedCalls: 1`. An event keyed on nothing could never be de-duplicated on the next
      run, so it is skipped — and counted.
    - **falsifiability —** goes red against emitting the read with a synthesised or empty
      `toolUseId`, and against skipping it silently so `unidentifiedCalls` stays 0.
11. **`the-scan-never-throws-on-a-deficient-transcript`**
    - **asserts —** three deficiencies each contribute nothing rather than failing the sweep: a
      MISSING file returns an empty scan without throwing; within one file, a truncated unparseable
      JSON fragment and a well-formed line carrying NO `cwd` key are both skipped while the one good
      line still lands.
    - **falsifiability —** goes red against throwing on `ENOENT` or on `JSON.parse`, against aborting
      the whole file after the first bad line so the later good read is lost, and against admitting the
      cwd-less line, which would return the same node id twice.
12. **`the-store-route-is-recognised-by-argv-shape`**
    - **asserts —** the two verbs that put a decision in front of a caller are recovered through the
      shell noise a real command carries — seven cases, including a bare `storytree` launcher, an
      `npx tsx packages/cli/src/main.ts` spelling, a `node packages/cli/launch.mjs` spelling, leading
      `cd … &&` and `timeout 240` tokens, trailing `2>&1 | head -25` and `>/dev/null` redirections, a
      numeric `adr pull 1` zero-padded to `adr-0001`, and one `;`-joined command yielding both ids.
    - **falsifiability —** goes red against requiring the launcher token to be literally
      `pnpm storytree`, against requiring it to be the FIRST token, against refusing commands that
      carry redirections or extra flags, against failing to zero-pad, and against stopping after the
      first segment of a `;`-joined command.
13. **`a-bare-decision-id-is-a-mention-never-a-read`**
    - **asserts —** nine commands that NAME a decision but read none record zero reads — an `echo`, an
      `arc increment close --note`, a `git commit -m`, a `question new --title`, plus
      `library artifact history`, `library artifact --set`, `adr push`, `adr new` and `adr list`. The
      declines are then sized on their own labels: `adr list --current` yields
      `declinedVerbs: ["adr list"]`, and `library artifact adr-0403 --set status=accepted` yields
      `["library artifact --set"]`.
    - **falsifiability —** goes red against matching `adr-NNNN` anywhere in the text rather than by
      argv position — which mints reads for the `echo`, the `--note`, the commit message and the
      `--title` — against reading a `--set` WRITE or a `history` call as a document read, and against
      recording the declines under any other label.
14. **`a-non-decision-artifact-is-never-a-decision-read`**
    - **asserts —** an ordinary artifact read records nothing, and the strict four-digit id guard keeps
      every near-miss out: `merge-ceremony`, `adr-health-notes` (an `adr-` prefix with no number),
      `adr-04031` (five digits) and `adr-403` (three digits) all yield no read.
    - **falsifiability —** goes red against accepting any `adr-`-prefixed artifact id as a decision —
      which is how `adr-health-notes` would silently inherit a decision's edges — against a loose
      `adr-\d+` with no right boundary, and against recording every `library artifact <id>` invocation
      as a decision read.
15. **`a-raw-field-read-is-not-a-whole-document-read`**
    - **asserts —** `--raw <field>` reads ONE stored field and is recorded at that strength:
      `library artifact adr-0403 --raw body` yields `strength: "front_matter_read"` while the bare form
      yields `"full_payload_read"`, and a command combining both collapses to a SINGLE read of
      `adr-0403` at the WEAKER strength.
    - **falsifiability —** goes red against omitting `strength` or always emitting
      `full_payload_read`, against not recognising `--raw`, against emitting two entries for the
      combined command, and against letting the strongest reading win — any of which inflates every
      re-read ratio taken from the trace.
16. **`a-heredoc-body-never-mints-a-store-read`**
    - **asserts —** two fully valid store-read invocations quoted inside a `python - <<'PY'` heredoc
      body mint nothing. A `storytree` verb inside a heredoc body is authored prose, not an invocation.
    - **falsifiability —** goes red against not stripping heredoc bodies before segmenting, which
      recovers `adr-0403` twice, and against terminating the heredoc on the wrong marker so the body
      lines re-enter the scrape.
17. **`the-pre-filter-is-never-narrower-than-the-matcher`**
    - **asserts —** a transcript whose only decision read is a STORE read is scanned and yields
      `[["adr-0403", "cli"]]`, though the file contains no `decisions/` substring anywhere — asserted
      first on the fixture's own bytes, so the fixture cannot smuggle the old shape back in.
    - **falsifiability —** goes red against narrowing the file-level pre-filter back to a
      `decisions[/\\]` hint, which skips the whole file before any tool call is examined and returns an
      empty scan indistinguishable from a file with nothing in it. A cheap pre-filter narrower than its
      own matcher is a second copy of the assumption, and a skipped file and an empty one read alike.
18. **`a-zero-is-reported-with-the-mentions-that-qualify-it`**
    - **asserts —** reads and mentions are counted INDEPENDENTLY, so the two zeros stop looking
      identical: a transcript of `adr list` / `adr new` / an `ADR-0404` echo yields no reads and
      `decisionMentions: 2`, while a transcript holding one ordinary source read yields no reads and
      `decisionMentions: 0`.
    - **falsifiability —** goes red against not counting mentions at all — which makes "nobody read a
      decision" and "this extractor can no longer see one" the same answer, the fault that survived the
      `docs/decisions/` deletion — against counting mentions per matched token rather than per tool
      call, and against counting an ordinary source path as a mention.
19. **`window-id-separates-sittings-inside-one-pooled-slot`**
    - **asserts —** two context windows sharing one worktree slot stay two windows: both reads carry
      `sessionId: "pooled-slot"` while their `windowId`s are the two distinct line-level ids. A
      per-sitting measure cannot union them.
    - **falsifiability —** goes red against carrying no `windowId` at all, against deriving `windowId`
      from the cwd so both read `pooled-slot`, and against the inverse error of deriving `sessionId`
      from the line-level id so the slot is lost.
20. **`window-id-is-the-parents-on-a-subagent-line`**
    - **asserts —** a subagent read is attributed to the window whose sitting it happened in, never to
      a window of its own: both reads carry the parent's `windowId` verbatim, while the `sidechain`
      flags stay `[false, true]` so who made the call is still distinguishable.
    - **falsifiability —** goes red against dropping sidechain lines, against synthesising a distinct
      window id for the subagent line, and against hardcoding the `sidechain` discriminator either way.
21. **`window-id-absent-is-undefined-not-blank`**
    - **asserts —** a line recording no usable window id yields `undefined` — for an ABSENT key, for a
      whitespace-only `"   "`, and for a non-string `12345` — while `sessionId` still resolves to the
      slot for all three.
    - **falsifiability —** goes red against defaulting a missing id to `""`, to `null`, or to the slot
      name, against accepting a whitespace-only id, and against coercing a number to a string — any of
      which lets a caller grouping by window collect them all into one giant sitting.

## Integration evidence

`packages/context-traversal-transcript/src/decision-reads.test.ts` writes real transcript JSONL into
unique `fs.mkdtempSync` directories and passes every helper an explicit path, so nothing reads the
developer's own `~/.claude/projects` and no assertion depends on HOME or on this machine's history.
The suite runs offline with no DB, no API key and no model, under
`pnpm --filter @storytree/context-traversal-transcript test`.

The assertions are written against the three ways this extractor fails while LOOKING finished: it
mints the wrong id form (so the reads close no caveat), it drops every subagent read, or it records a
file being WRITTEN as a file being read. Each has its own negative case above, and the near-miss
fixtures — `docs/mydecisions/0001-a.md`, `docs/decisions/12-a.md`, `adr-health-notes`, `adr-403`, the
heredoc bodies, the redirect target, the lobby cwd — are the load-bearing half of the suite rather
than decoration.

**No signed verdict backs this capability.** The suite is green and observed by the command above, but
it was never driven red→green by the spine (see the frontmatter note). Any adoption must OBSERVE the
command green under ADR-0085's brownfield route; it must not manufacture a red against files that
already exist.
