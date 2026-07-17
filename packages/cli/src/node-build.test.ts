import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { RealProofConfig } from "@storytree/orchestrator";

import { run } from "./commands.js";
import {
  buildableNodeIds,
  DEFAULT_TEST_DB_NAME,
  nodeBuild,
  nodeHelp,
  renderLeafPhasePrompts,
  resolveAddDepsGroup,
  resolveDbProofEnv,
  resolveVerdictStore,
  workspacePackageForSource,
} from "@storytree/drive";
import type { ClaimStoreLike, SessionIdentity, WispSmokeStore } from "@storytree/drive";

/**
 * `storytree node build <id> --dry-run` (drive-machinery Phase C), driven through `run` exactly as
 * `main` does. All offline: scripted model, temp workspace, InMemoryStore — zero API cost, no DB.
 * `--actor` pins the signer so the tests are deterministic on any machine (no git-email reliance).
 */

/** The node area never touches the library store; an empty InMemoryStore keeps the tests fast. */
const deps = { store: new InMemoryStore() };

// ── ADR-0099-B: a SYNTHETIC walk may never persist to pg (the owed guard test) ───────────────────

test("resolveVerdictStore: ADR-0099-B refuses --store pg for a SYNTHETIC walk (dry-run OR live smoke)", async () => {
  const synthetic = true; // a --dry-run scripted walk OR a --live add(2,3) smoke
  const res = await resolveVerdictStore("pg", synthetic, "storytree node build x --live");
  assert.equal(res.ok, false);
  assert.match(res.refusal.body, /SYNTHETIC walk/);
  assert.match(res.refusal.body, /forged `healthy`/);
  assert.match(res.refusal.body, /Only --real/);
  // The retry nudge points at --real, never --live (a live smoke can never earn pg).
  assert.ok(res.refusal.next?.some((n) => /--real --store pg/.test(n)));
});

test("resolveVerdictStore: a synthetic walk still resolves the in-memory stores (undefined / the memory seam)", async () => {
  for (const flag of [undefined, "memory"]) {
    const res = await resolveVerdictStore(flag, true, "retry");
    assert.equal(res.ok, true, `flag=${String(flag)}`);
    assert.equal(res.persisted, false);
  }
  // An unknown store is still its own (non-pg) refusal, not the synthetic-pg one.
  const bogus = await resolveVerdictStore("bogus", true, "retry");
  assert.equal(bogus.ok, false);
  assert.match(bogus.refusal.body, /unknown --store/);
});

test("node build <id> --dry-run walks the gate and reports trail + verdict + rollup", async () => {
  const env = await run(
    ["node", "build", "library-cli", "--dry-run", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, true, env.body);
  // The full phase trail, in order.
  assert.match(env.body, /AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE/);
  // The signed verdict, attributed to the --actor signer, rendered by core's verdictLine (the
  // promoted verdict-line node is the live consumer here), with the spine's red→green evidence.
  assert.match(env.body, /verdict: {5}PASS library-cli \(capability\) — signed by tester@example\.com @ /);
  assert.match(env.body, /observation:red, observation:green/);
  // The real spec drove it: real file, real proof-mode mapping.
  assert.match(env.body, /stories\/library\/library-cli\.md/);
  assert.match(env.body, /integration-test → capability/);
  // The rollup DERIVES healthy off the event log (building → signed pass).
  assert.match(env.body, /rollup: {6}healthy/);
  // The honest framing is part of the output, not just a code comment.
  assert.match(env.body, /proves the GLUE/);
  assert.match(env.body, /NOT the\nnode's actual proofs/);
});

test("node build with no mode is refused (must pick --dry-run or --live)", async () => {
  const env = await run(["node", "build", "library-cli"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /pick exactly one mode/);
  assert.match(env.body, /--live/);
  assert.ok(env.next?.some((n) => n.includes("--dry-run")));
  assert.ok(env.next?.some((n) => n.includes("--live")));
});

test("node build with BOTH modes is refused (dry-run xor live)", async () => {
  const env = await run(["node", "build", "library-cli", "--dry-run", "--live"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /pick exactly one mode/);
});

test("node build with --dry-run AND --real is refused; the mode menu names --real", async () => {
  const env = await run(["node", "build", "verdict-line", "--dry-run", "--real"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /pick exactly one mode/);
  assert.match(env.body, /--real/);
  assert.match(env.body, /REAL proof command|REAL test\/impl/);
  assert.ok(env.next?.some((n) => n.includes("--real")));
});

test("node build --real on a node WITHOUT a real-proof config fails closed before any worktree", async () => {
  // browse-library is config-less (the library caps gained real arms in ADR-0092), so it is the
  // corpus's non-REAL-buildable node — --real refuses it before any worktree, naming the real targets.
  const env = await run(
    ["node", "build", "browse-library", "--real", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /not REAL-buildable/);
  assert.match(env.body, /verdict-line/);
  assert.ok(env.next?.some((n) => n === "storytree node build verdict-line --real"));
});

test("the verdict-line node spec loads and dry-runs (the real target is also glue-driveable)", async () => {
  const env = await run(
    ["node", "build", "verdict-line", "--dry-run", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /stories\/drive-machinery\/verdict-line\.md/);
  assert.match(env.body, /contract-test → contract/);
  assert.match(env.body, /rollup: {6}healthy/);
});

test("node build with an unknown id is guidance listing the buildable nodes", async () => {
  const env = await run(["node", "build", "no-such-node", "--dry-run", "--actor", "t@e.c"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /no node spec "no-such-node"/);
  assert.ok(env.next?.some((n) => n.includes("library-cli")));
});

test("node build on a spec that exists but has NO proof config fails closed", async () => {
  // studio/browse-library.md is a real spec with neither a spec-borne `proof:` block nor a
  // registry entry (ADR-0057) — so it fails closed, naming both routes out.
  const env = await run(
    ["node", "build", "browse-library", "--dry-run", "--actor", "t@e.c"],
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /no proof config/);
  assert.match(env.body, /proof:/);
});

test("node build without an id, and bare `node`, are help/guidance", async () => {
  const bare = await run(["node"], deps);
  assert.equal(bare.ok, true);
  assert.match(bare.body, /node build <id> --dry-run/);
  assert.match(bare.body, /library-cli/);
  assert.match(bare.body, /--real/);
  // and cloud-sql-admin-rest; the binding-staleness slices (ADR-0016; proof: blocks in
  // stories/binding-staleness/*.md): boundhash-on-verdict, change-event-store, change-store-pg (the
  // ADR-0064 §1 DB-backed PgChangeStore proof), drift-reads-store, gate-emits-change, source-drift;
  // the first three `agent`-story capabilities (stories/agent/*.md): leaf-tool-surface,
  // model-runtime-seam, owned-turn-loop; and the three thick-client `desktop`-story capabilities
  // (stories/desktop/*.md, ADR-0113 — each a NET-NEW `real:` arm): local-backend-boot, local-credential-wiring,
  // shared-forest-connection (the last RE-HOMED by ADR-0117 — same proof file, now a broker client), plus
  // two more desktop `real:` caps beyond that original ADR-0113 trio: boot-read-routes (ADR-0119, the boot
  // read set) and chat-sse-mount (ADR-0108 Phase 2 — the consumed startChatStream mounted at POST /api/chat
  // and streamed as SSE);
  // plus the launch-precondition gate desktop-launch-preconditions (stories/desktop/desktop-launch-preconditions.md
  // — ADR-0176, a NET-NEW `real:` arm: the sidecar proves a reachable DB + a git checkout before wiring
  // any backend, retiring the degraded read shell; the Electron main() wiring + splash/refuse window are
  // operator-attested glue, not a machine leg);
  // the two ADR-0117 broker units: builder-role (stories/studio-members/builder-role.md — an
  // EDITS-EXISTING `real:` arm adding the third role to users.ts) and write-broker
  // (stories/studio-cloud/write-broker.md — a NET-NEW `real:` arm: the members-gated write endpoint);
  // and the `cli` story's `organism-boundary-tooling` capability's three contracts, each an
  // editsExisting `real:` arm over packages/cli/src/boundaries.ts:
  // declared-edge-drift-report (stories/cli/declared-edge-drift-report.md — the ADR-0115 declared-edge
  // drift report), hosted-story-landlord-rule (stories/cli/hosted-story-landlord-rule.md — the
  // ADR-0192 BLOCKING landlord rule: a story whose unit sources live in another story's building must
  // be a declared neighbour either way) and packages-forward-refusal
  // (stories/cli/packages-forward-refusal.md — ADR-0192 decision 2, the second BLOCKING rule: a hosted
  // story absent from the frozen `hostedStories` grandfather register is refused REGARDLESS of declared
  // edges, and a stale register entry is itself a violation).
  // Plus the `studio` story's chat-panel capability (stories/studio/chat-panel.md — a NET-NEW `real:` arm:
  // the renderer chat panel, the first studio frontend cap proof-wired for the vitest two-stage, ADR-0070;
  // its real arm declares a vitest `proofCommand` since the studio suite is vitest, not node:test).
  // Most of the library
  // story's 7 capabilities are NO LONGER here:
  // ADR-0094 (supersedes_in_part 92 d.1 & d.5) removed their brownfield `real:` arms — the library is
  // `mapped`, so its green path is Adopt (`## Reliability Gates`, ADR-0085), not a fail-closed `--real`
  // Build. They keep their spec-borne dry-run/live `command`+`scope`, so they stay in "buildable nodes"
  // (single-node `--live`) but drop out of "REAL-buildable nodes". The EXCEPTIONS are the two build-tests
  // gate targets: `seed-corpus-scripts` (ADR-0098 U5 — an R2 `refactorForTests` arm the story's
  // `library#gate-4` `(build:)`s) and `event-sourced-store-seam` (ADR-0098 — an R1 `editsExisting` arm,
  // `db: true`, the story's `library#gate-5` `(build:)` over the `createPool` fail-closed contract). Both
  // are real-buildable again ONLY to be driven via their gate, not a blanket story Build — the gate's
  // verdict signs FOR the gate id and greens no capability, so the other five caps stay arm-less and the
  // story is not real-buildable.
  // The four `chat-drive-bridge`-story capabilities (accept-to-land-affordance, chat-build-dispatch,
  // proposal-id-threading, proposed-unit-signal) were RETIRED by ADR-0155 (2026-07-04): the chat
  // propose_unit / accept-to-Build handshake was removed (PR #587) — the session-orchestrator drives via
  // its spawn (ADR-0137) + landing (ADR-0152) tools instead of proposing a unit for a human to accept.
  // Their `real:` arms were dropped, so they are no longer REAL-buildable (the whole story retired).
  // The four `headless-orchestrator`-story capabilities (headless-session-runner,
  // orchestrator-composition, orientation-tool-surface, chat-session-stream) are NO LONGER here:
  // RETIRED with the headless-orchestrator story (ADR-0175 companion reconcile, owner-directed
  // 2026-07-17) — the dormant chat substrate is absorbed into `app-guide`. Their `real:` arms were
  // dropped, so they are no longer REAL-buildable (the story specs stay, retired in place, as history).
  // And the desktop-build-mount story's `worker-relocation` + `desktop-build-route` capabilities
  // (stories/desktop-build-mount/*.md — ADR-0133, the desktop becomes a build surface by relocating the
  // build worker to a shared package and mounting it on the desktop sidecar), each a `real:` arm. Its
  // third original cap, `desktop-accept-dispatch`, was RETIRED by ADR-0155 with the accept handshake (its
  // /api/chat/accept route was removed) — so it is no longer REAL-buildable; the story keeps its other
  // caps. (routed-node-real-dispatch, the post-landing increment, is listed separately below.)
  // And the four PROVABLE `wisp-as-story-claim`-story capabilities (stories/wisp-as-story-claim/*.md —
  // ADR-0138, the forest wisp becomes a forced, CI-cleared story-CLAIM): claim-store-work-time (A — an
  // editsExisting db-backed `real:` arm over PgClaimStore's releaseClaimsByBranch), render-claim-as-wisp
  // (B — a NET-NEW pure fold of node_claim rows into map activity), colour-by-subagent (C — a NET-NEW pure
  // subagent→colour mapping) and take-claim-at-spawn (E — a NET-NEW pure spawn-claim seam). The story's
  // other two caps are operator-attested (no `real:` arm, witnessed not built): ci-clear-on-merge (D, glue)
  // and appearance-uat (F, the §5-honesty-wall human UAT).
  // And the eight PROVABLE `library-review`-story capabilities (stories/library-review/*.md — ADR-0140,
  // the word-processor Review mode for library open-questions): the five backend LEAF arms
  // block-position-comment-anchor (the block-anchor comment model + the normalizeCommentAnchor write
  // boundary), suggestion-edit-store, accept-reject-suggestion-api, member-suggest-write-policy,
  // review-refresh-feed; and the three LOOK caps with vitest two-stage `real:` arms (ADR-0070):
  // review-mode-toggle, inline-comment-thread, collapsed-suggestion-view. The ninth cap,
  // remove-text-selection-anchoring, is GLUE (no `real:` arm) so it is absent here.
  // The five `chat-subagent-spawn`-story capabilities (story-author-spawn, builder-spawn-dispatch,
  // claim-gated-spawn, spawn-tool-surface, spawn-deps-composition) are NO LONGER here: RETIRED by
  // ADR-0174 + ADR-0175 (owner-directed 2026-07-17) — the chat's agent-side spawn authority is moot
  // now that the embedded terminal running real Claude Code is the interactive seat (spawn/landing do
  // not go to app-guide). Their `real:` arms were dropped, so they are no longer REAL-buildable (the
  // story specs stay, retired in place, as history).
  // And the four parent-side LEAF caps of the `website-experience` story
  // (stories/website-experience/*.md — ADR-0134 the two-act vibe-coding experience, over the
  // ADR-0123 R3F mapper): r3f-world-spike (NET-NEW — the pure world→3D descriptor mapping; the
  // package scaffold is orchestrator glue BEFORE its leaf runs), web-experience-sync (an
  // editsExisting arm generalising packages/cli/src/web-engine-sync.ts to a second synced package),
  // act2-beat-director (NET-NEW — the pure visitor-paced five-beat director) and
  // experience-rollout-guardrails (NET-NEW — the check:web-experience pure judge). The story's
  // other four caps are operator-attested web-repo work (no `real:` arm — the storm, the
  // inflection, the Act 2 walkthrough, the info-page triage), so they are absent here.
  // And the desktop-build-mount story's post-landing increment routed-node-real-dispatch
  // (stories/desktop-build-mount/routed-node-real-dispatch.md — ADR-0144, an editsExisting `real:` arm
  // over packages/drive/src/build-worker.ts: the routed NODE dispatch drives `node build --real` with
  // persist semantics instead of the synthetic `--live` smoke).
  // The four `spawn-visibility`-story capabilities (chat-spawn-trace-events, claim-wisp-cold-start,
  // chat-panel-spawn-render, live-story-island-refresh) are NO LONGER here: RETIRED by ADR-0174 +
  // ADR-0175 (owner-directed 2026-07-17) — the chat spawn this made visible is retired with
  // chat-subagent-spawn (interactive orchestrator chat retired for an embedded terminal running real
  // Claude Code). Their `real:` arms were dropped, so they are no longer REAL-buildable (the story
  // specs stay, retired in place, as history).
  // And the four `app-guide`-story capabilities (stories/app-guide/*.md — formerly `terminal-chat`,
  // re-aimed under ADR-0175; ADR-0137 Phase-3 UAT feedback, ADR-0070 two-stage: the chat-panel UX
  // substrate for the concierge): the three thin-client caps multi-turn-transcript (the persistent
  // scrollback), auto-grow-input (the growing input) and transcript-reset (clear + abort), each an
  // editsExisting vitest `real:` arm over ChatPanel.tsx / api.ts; and the OPTIONAL/STRETCH
  // backend-chat-reset-route (a desktop node:test arm over the sidecar reset route — buildable but
  // HELD, so it lands separately). The continuous-conversation feel is the story's operator-attested
  // UAT legs, not a capability.
  // (The `scoped-glue-actuator`-story capabilities glue-worker-spawn / spawn-glue-tool /
  // glue-deps-composition are NO LONGER here: ADR-0175 retired the desktop chat's spawn_glue_worker
  // actuator as redundant — the embedded terminal (ADR-0174) makes glue edits natively — so their
  // story specs + `real:` arms were removed; only the glue-worker *agent definition* optionally
  // survives as a fenced subagent, which carries no `real:` arm.)
  // And the two `embedded-terminal`-story capabilities (stories/embedded-terminal/*.md — ADR-0174,
  // the desktop app embeds a REAL local terminal, xterm.js over node-pty, replacing the chat as the
  // interactive build surface — distinct from `app-guide`, the dormant chat panel re-aimed as the
  // help/setup concierge): pty-session-manager (NET-NEW node:test over an injected fake PtyPort — the
  // Electron-main pty lifecycle, no native module at test time) and terminal-dock-panel (NET-NEW
  // vitest jsdom over a mocked xterm + a mocked desktopTerminal bridge — the renderer xterm dock,
  // ADR-0070 geometry-machine-proven; the terminal LOOK + the real-pty run are operator-attested UAT
  // legs). The real node-pty adapter + preload bridge + the TreeView dock-slot swap are operator-
  // attested glue (no `real:` arm), not capabilities.
  // And credential-broker (stories/desktop/credential-broker.md — ADR-0179): the desktop-only
  // Credentials panel vitest `real:` arm over CredentialsPanel.tsx (geometry/behaviour); the real
  // OS-keychain Cursor-key leg is operator-attested, not machine-asserted.
  // And library-adr-wire-signals (stories/library-tech-tree-overlay/library-adr-wire-signals.md —
  // ADR-0187 increment 6, MACHINE-ONLY / no look leg): the NET-NEW studio vitest `real:` arm over
  // apps/studio/server/adrWireSignals.ts (the pure, tolerant flat-scan parseAdrWireSignals surfacing
  // each ADR's load_bearing boolean + its deduped supersedes/supersedes_in_part/amends lineage-edge
  // NUMBERS); the number→doc-id resolution + the listDocs DocMeta fold + the types.ts optional
  // loadBearing/references fields are supplement glue after PASS, not this cap's `real:` scope.
  // And library-dive-body (stories/library-tech-tree-overlay/library-dive-body.md —
  // ADR-0185 increment 4, ADR-0070 two-stage): the NET-NEW studio vitest `real:` arm over
  // LibraryDiveBody.tsx + diveBody.ts (the pure planDive router + a thin component reusing
  // AssetView/DocView to render the dived artifact's full body; DocView owns the on-demand
  // docContent fetch); the forest-cozy reading pane + the TreeView diveSlot mounting are the
  // story's operator-attested UAT leg.
  // And library-drawer-shell (stories/library-tech-tree-overlay/library-drawer-shell.md —
  // ADR-0185 increment 1, ADR-0070 two-stage): the NET-NEW studio vitest `real:` arm over
  // LibraryDrawer.tsx (the ?overlay=library peek↔dive↔closed state machine); the forest-cozy
  // look + the TreeView mounting are the story's operator-attested UAT leg.
  // And library-finder (stories/library-tech-tree-overlay/library-finder.md — ADR-0185 increment 2,
  // ADR-0070 two-stage): the NET-NEW studio vitest `real:` arm over LibraryFinder.tsx + librarySearch.ts
  // (the search-only finder over the loaded corpus, kind sub-line via kindLabel); the forest-cozy
  // look + the peek-slot mounting are the story's operator-attested UAT leg.
  // And library-dag-canvas (stories/library-tech-tree-overlay/library-dag-canvas.md —
  // ADR-0188 increment 10 dec 5, ADR-0070 two-stage): the BROWNFIELD studio vitest `real:` rework of
  // LibraryFocusGraph.tsx + focusGraph.ts into a true layered reference DAG (references[] both-ways
  // adjacency to FULL transitive depth, dagre LR ranks, DRAWN SVG edges between rank-adjacent nodes,
  // per-branch ⊕ expanders replacing the retired depth stepper, ← Back leading the breadcrumb with no
  // canvas header, a machine-asserted fit-to-view viewBox containing every node); the seed-packet look
  // + the two-pane mounting are the story's operator-attested UAT leg (shared inc-9+10 sitting). It
  // RETIRES library-focus-subgraph (same source files, new capability/test/prefix).
  // And library-overview (stories/library-tech-tree-overlay/library-overview.md —
  // ADR-0185 increment 5, ADR-0070 two-stage): the NET-NEW studio vitest `real:` arm over
  // LibraryOverview.tsx + overviewConstellation.ts (the empty-state whole-corpus dot field under
  // the FAR/MID/CLOSE LOD ladder, importance = reference-graph degree, the overview owning its own
  // search input for search-glow); the forest-cozy dot-field look + the TreeView empty-state peek
  // mounting are the story's operator-attested UAT leg.
  // And library-open-overlay (stories/library-tech-tree-overlay/library-open-overlay.md — ADR-0187
  // increment 8 dec 2, ADR-0070 two-stage): the NET-NEW studio vitest `real:` arm over
  // LibraryOpenOverlay.tsx (a separate full-detail document overlay OVER the map that REUSES the
  // byte-locked LibraryDiveBody router; null selection renders nothing; a dismiss control fires
  // onDismiss); the "like opening a Word doc" look + the TreeView mounting are the operator-attested leg.
  // And library-open-trigger (stories/library-tech-tree-overlay/library-open-trigger.md — ADR-0187
  // increment 8 dec 2, ADR-0070 two-stage): the NET-NEW studio vitest `real:` arm (LibraryOpenTrigger.test.tsx)
  // over ADDITIVE onOpen/onDoubleClick edits to LibraryOverview.tsx + LibraryFocusGraph.tsx (a node
  // double-click lifts the finder-parity SearchResult via onOpen; single-click onSelect/onFocus unchanged).
  // And library-permanent-lens (stories/library-tech-tree-overlay/library-permanent-lens.md — ADR-0187
  // increment 8 dec 1/2, ADR-0070 two-stage): the BROWNFIELD studio vitest `real:` re-author of
  // LibraryDrawer.tsx into a PERMANENT LENS (retiring the closed→peek→dive machine + the × close button;
  // the flag gates presence; the map stays live; a bodySlot renders content; a bottom selection-preview
  // section fires Open); the forest-cozy lens look + the TreeView mounting are the operator-attested leg.
  // And library-typed-edges (stories/library-tech-tree-overlay/library-typed-edges.md —
  // ADR-0187 increment 7, MACHINE-ONLY / no look leg): the editsExisting @storytree/library node:test
  // `real:` arm over render-doc.ts — surfacing a structured doc's typed navigation edges (an agent's
  // stepRefs, a process's branchEdges, a plan's arcRef) onto the RenderedAsset wire, spread-when-present
  // on the structured branch only; the toGuidanceAsset carry-through + the types.ts optional
  // stepRefs/branchEdges/arcRef fields are supplement glue after PASS, not this cap's `real:` scope.
  // And the three library-tech-tree-overlay inc-9 panel-remold capabilities (ADR-0188, ADR-0070
  // two-stage): library-category-shelf (BROWNFIELD studio vitest over LibraryFinder.tsx + the NET-NEW
  // pure libraryShelf.ts — the idle category shelf with corpus-derived counts, the removable scope
  // chip, scoped browse-then-filter; the signed lf-* query path stays byte-green),
  // library-selection-card (NET-NEW studio vitest over LibrarySelectionCard.tsx + the pure
  // selectionDetail.ts — the pinned side-panel card: corpus-resolved description, ADR status +
  // read-only loadBearing badge, Open fires onOpen, stale-selection tolerance), and
  // library-top-drawer (BROWNFIELD studio vitest re-author of LibraryDrawer.tsx — ADR-0191
  // REPLACING library-lens-minimise: the lens state is URL-derived, ?overlay=library = expanded,
  // absent = a default-visible collapsed top drawer handle firing onToggle; the component-local
  // Minimise/Restore machine retired). The TreeView onToggle rewire + the full-width/top-third
  // look are the story's operator-attested UAT leg (shared inc-9+10 sitting).
  // And the two map-terminal-build-story capabilities (stories/map-terminal-build/*.md — ADR-0174
  // map-spawn re-point: on the desktop a forest-map Build click SEEDS a `pnpm storytree … build <id>
  // --real --store pg` command into the embedded terminal instead of dispatching in-app): compose-build-
  // command (NET-NEW studio vitest — the pure command string) and map-build-seeds-terminal (editsExisting
  // studio vitest jsdom — the BuildSection desktop seed-not-dispatch branch). The dock's own seed handling
  // (accept + pre-fill) was originally terminal-dock-seed here but ADR-0186 re-decided it — a seed opens a
  // FRESH tab — so terminal-tabs' seed-opens-new-tab superseded it. The TreeView seed wiring is the story's
  // operator-attested glue (no `real:` arm), not a capability.
  // And the three `terminal-repo-picker`-story capabilities (stories/terminal-repo-picker/*.md — ADR-0174
  // follow-on: the embedded terminal opens in a repo the user PICKS, and FAIL-CLOSES until one is):
  // repo-selection (NET-NEW node:test over injected DirProbe + SelectionStore ports — the
  // validate/persist/read/resolve-cwd lifecycle, no real node:fs at test time), repo-picker-panel (NET-NEW
  // vitest jsdom over a mocked desktopRepo bridge — the renderer picker, ADR-0070 geometry-machine-proven;
  // its explicit vitest `proofCommand` since the studio suite is vitest, not node:test) and
  // terminal-repo-gate (NET-NEW vitest jsdom over a mocked desktopRepo `ready`/`onChanged` bridge + a
  // mocked TerminalDock — the fail-closed WRAPPER that renders the embedded terminal ONLY when a valid repo
  // is ready and reopens it on a repo change, ADR-0070). The real node:fs/userData adapters + the native
  // dialog + the `desktopRepo` preload bridge (with its `ready`/`onChanged` gate slice + the fail-closed
  // `repo:ready`/`terminal:spawn` in main) + the TreeView mount (`<TerminalRepoGate/>` wrapping the dock) +
  // threading resolveCwd into the EXISTING terminal spawn are operator-attested glue (no `real:` arm); the
  // native-dialog / opens-in-the-picked-repo / survives-relaunch / gate-holds / look legs are the story's
  // operator-attested UAT.
  // And the two terminal-tabs-story capabilities (stories/terminal-tabs/*.md — ADR-0186: the embedded
  // terminal becomes multi-session with a tab strip so a map Build seed opens a FRESH tab, never the
  // active Claude Code session): multi-session-tabs (editsExisting studio vitest jsdom — the dock holds N
  // pty sessions with a switch/new/close tab strip; the tdp-* behaviours re-proven per-tab) and
  // seed-opens-new-tab (editsExisting studio vitest jsdom — a seed opens a fresh tab + pre-fills there,
  // SUPERSEDING map-terminal-build's terminal-dock-seed write-to-active behaviour). The tab-strip look is
  // the story's operator-attested UAT leg.
  // And the two library-tech-tree-overlay inc-13 unified-lifecycle capabilities (ADR-0196):
  // library-lifecycle-wire (editsExisting @storytree/library node:test — the NET-NEW pure browser-safe
  // lifecycleOf projection mapping every stored per-kind vocabulary onto open|active|archived, + the
  // render-doc.ts plan-`status` wire crossing, the typed-edges spread-when-present idiom; MACHINE-ONLY,
  // no look leg) and library-lifecycle-shelf (BROWNFIELD studio vitest over LibraryFinder.tsx +
  // libraryShelf.ts + the additive types.ts status mirror — the Active|All lifecycle toggle defaulting
  // Active, live open+active counts with muted totals, the Decisions group-only count fix, per-kind
  // scoped state chips; the signed lf-*/lcs- paths stay byte-green; toggle/chip look operator-attested).
  // And the library-tech-tree-overlay inc-11 arc-closing capability (ADR-0185 dec 6):
  // library-retire-standalone-page (editsExisting studio vitest, PURE-LIB over route.ts only — retire the
  // {name:'library'} Route variant, redirect /library paths to the tree route, re-point libraryHref() to the
  // ?overlay=library#/tree lens href; the caller sweep + Library.tsx deletion are the orchestrator's
  // supplement glue after PASS, not part of the `real:` arm; no look leg — the lens look was signed 2026-07-15).
  // And the studio-cloud story's deploy-health-signal capability
  // (stories/studio-cloud/deploy-health-signal.md — ADR-0194: a red hosted-studio deploy must be loud):
  // a NET-NEW dependency-free node:test `real:` arm over packages/cli/src/deploy-health.ts — the pure
  // classifier turning the newest-first deploy-studio CD run list into an ok/red/unknown gate-tail
  // verdict (red streak length / red-since / newest red URL / last green, LOUD WARN format). The
  // gh-shelling wrapper (check-deploy-health.ts) + the root package.json gate-tail wiring are
  // un-asserted session glue (ADR-0158), not part of the `real:` arm.
  // And the `studio` story's hud-chrome capability (stories/studio/hud-chrome.md — ADR-0204 as
  // amended by ADR-0205's one-pathway re-tense, under studio-hud-chrome-arc, ADR-0070 two-stage):
  // the BROWNFIELD studio vitest `real:` arm over App.tsx + lib/route.ts + Hud.tsx (the forest as
  // the landing route with Home/Overview retired, the topbar removed, and ONE floating control —
  // the verified-identity initials avatar whose menu is account-only: identity line + Members
  // (admin-gated) / Credentials (desktop-gated) / IAP Sign out; no brand chip, no navigation
  // entries — the map's library drawer is the one pathway); the HUD look is the story's
  // operator-attested UAT leg (ADR-0070 stage 2). Its arc sibling verified-attribution
  // (stories/studio/verified-attribution.md — ADR-0204 D4, increment 2): the BROWNFIELD studio
  // vitest `real:` arm finishing the operator-field retirement — comment attribution derives from
  // the verified /api/me identity (server-stamped on the scoped path), lib/operator.ts +
  // useOperator + the storytree.operator localStorage key deleted (type-proven by the typecheck wall).
  // And the `library` story's graduation-park-lease capability
  // (stories/library/graduation-park-lease.md — ADR-0202: the parked-memory lease compute): a NET-NEW
  // pure browser-safe @storytree/library node:test `real:` arm over
  // packages/library/src/graduation/park.ts (ParkRecord/ParkLedger zod, the content hash, the lease
  // date math, the new|changed|expired|parked classifier, the live-only worklist counts) + the barrel
  // re-export. The ledger file I/O, the `graduate park` CLI subcommand, and the
  // check-graduation-worklist.ts rewire are after-PASS supplement glue (ADR-0158), not the `real:` arm.
  assert.match(
    bare.body,
    /REAL-buildable nodes: +accept-reject-suggestion-api, act2-beat-director, ambient-integration, auto-grow-input, backend-chat-reset-route, block-position-comment-anchor, boot-read-routes, boundhash-on-verdict, brokered-local-uat-signing, builder-role, change-event-store, change-store-pg, chat-panel, chat-sse-mount, claim-store-work-time, cloud-sql-admin-rest, collapsed-suggestion-view, colour-by-subagent, compose-build-command, credential-broker, declared-edge-drift-report, deploy-health-signal, desktop-build-route, desktop-launch-preconditions, dogfood-probe-mrfuze9m, drift-reads-store, event-sourced-store-seam, experience-rollout-guardrails, gate-emits-change, graduation-park-lease, hosted-story-landlord-rule, hud-chrome, inline-comment-thread, leaf-tool-surface, library-adr-wire-signals, library-category-shelf, library-dag-canvas, library-dive-body, library-drawer-shell, library-finder, library-lifecycle-shelf, library-lifecycle-wire, library-open-overlay, library-open-trigger, library-overview, library-permanent-lens, library-retire-standalone-page, library-selection-card, library-top-drawer, library-typed-edges, local-backend-boot, local-credential-wiring, map-build-seeds-terminal, member-suggest-write-policy, model-runtime-seam, multi-session-tabs, multi-turn-transcript, node-resolve-report, noticeboard-cli, owned-turn-loop, packages-forward-refusal, pty-session-manager, r3f-world-spike, render-claim-as-wisp, repo-picker-panel, repo-selection, review-mode-toggle, review-refresh-feed, routed-node-real-dispatch, seed-corpus-scripts, seed-opens-new-tab, shared-forest-connection, source-drift, suggestion-edit-store, take-claim-at-spawn, terminal-dock-panel, terminal-repo-gate, transcript-reset, tree-view, uat-bound-command-adoption, uat-machine-gate-resolution, uat-machine-proof-binding, verdict-glyphs, verdict-line, verified-attribution, web-experience-sync, witnessable-verdict, worker-relocation, write-broker/,
  );

  const noId = await run(["node", "build", "--dry-run"], deps);
  assert.equal(noId.ok, false);
  assert.match(noId.body, /needs an id/);
});

test("renderLeafPhasePrompts assembles the live leaf's per-phase prompts from the Library (ADR-0051 §4)", async () => {
  // The live/real SDK leaf's system prompt IS the rendered red-builder (AUTHOR_TEST) /
  // green-builder (IMPLEMENT) agent — assembled offline from the seed corpus, fail-loud on a
  // missing agent or a dangling ref. This pins that the wiring resolves the renamed agents and
  // injects their bodies (the anti-blindside guarantee: never a generic fallback).
  const res = await renderLeafPhasePrompts();
  assert.equal(res.ok, true, res.ok ? "" : res.refusal.body);
  if (!res.ok) return;
  // The AUTHOR_TEST prompt is the red-builder agent, the IMPLEMENT prompt is the green-builder.
  assert.match(res.prompts.AUTHOR_TEST, /red-builder/);
  assert.match(res.prompts.AUTHOR_TEST, /AUTHOR_TEST/);
  assert.match(res.prompts.IMPLEMENT, /green-builder/);
  assert.match(res.prompts.IMPLEMENT, /IMPLEMENT/);
  // The renderer INJECTS the ref bodies (reference-don't-restate) — the prove-it-gate context is
  // present, not just a list of asset ids.
  assert.match(res.prompts.AUTHOR_TEST, /## Context/);
  // The OLD ids are gone from the assembled prompt — the rename actually took.
  assert.doesNotMatch(res.prompts.AUTHOR_TEST, /leaf-test-author/);
  assert.doesNotMatch(res.prompts.IMPLEMENT, /leaf-implementer/);
});

test("the story node (library) dry-runs too, with the UAT → story proof-mode mapping", async () => {
  const env = await run(
    ["node", "build", "library", "--dry-run", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /stories\/library\/story\.md/);
  assert.match(env.body, /UAT → story/);
  assert.match(env.body, /rollup: {6}healthy/);
});

// ── spec-borne node DISCOVERY (ADR-0057 A; the gap the blind dogfood test surfaced) ─────────────

/** A fixture stories dir with ONE spec-borne-only node (a `proof:` block, NO registry entry). */
async function fixtureSpecBorneStories(opts: { withMalformed?: boolean } = {}): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-discovery-"));
  const storyDir = path.join(dir, "feat-story");
  await fs.mkdir(storyDir, { recursive: true });
  await fs.writeFile(
    path.join(storyDir, "cap-spec-borne.md"),
    [
      "---",
      'id: "cap-spec-borne"',
      "tier: capability",
      'title: "x"',
      'outcome: "y"',
      "status: proposed",
      "proof_mode: integration-test",
      "proof:",
      "  command:",
      "    file: node",
      '    args: ["--version"]',
      "  scope:",
      '    testGlobs: ["packages/fixture/x.test.ts"]',
      '    sourceGlobs: ["packages/fixture/x.ts"]',
      "  real:",
      '    testFile: "packages/fixture/x.test.ts"',
      '    sourceFile: "packages/fixture/x.ts"',
      "    scope:",
      '      testGlobs: ["packages/fixture/x.test.ts"]',
      '      sourceGlobs: ["packages/fixture/x.ts"]',
      "---",
      "# x",
      "",
    ].join("\n"),
  );
  if (opts.withMalformed === true) {
    // A malformed proof block (scope missing sourceGlobs) — must be SKIPPED in the listing, not throw.
    await fs.writeFile(
      path.join(storyDir, "cap-bad.md"),
      [
        "---",
        'id: "cap-bad"',
        "tier: capability",
        'title: "x"',
        'outcome: "y"',
        "status: proposed",
        "proof_mode: integration-test",
        "proof:",
        "  command:",
        "    file: node",
        '    args: ["--version"]',
        "  scope:",
        // sourceGlobs deliberately omitted — this block is malformed (missing a scope half) and must
        // be SKIPPED in the listing. testGlobs is rooted so the ONLY malformation is the missing half.
        '    testGlobs: ["packages/fixture/x.test.ts"]',
        "---",
        "# x",
        "",
      ].join("\n"),
    );
  }
  return dir;
}

test("buildableNodeIds merges SPEC-BORNE nodes with the registry (a self-registered node is discoverable)", async () => {
  const dir = await fixtureSpecBorneStories();
  try {
    const { buildable, realBuildable } = buildableNodeIds(dir);
    // The spec-borne-only node (no registry entry) appears in BOTH lists.
    assert.ok(buildable.includes("cap-spec-borne"), `buildable has cap-spec-borne: ${buildable}`);
    assert.ok(realBuildable.includes("cap-spec-borne"), `realBuildable has cap-spec-borne`);
    // The registry nodes are still there (union, not replacement).
    assert.ok(buildable.includes("library-cli"), "registry node library-cli still listed");
    assert.ok(realBuildable.includes("verdict-line"), "registry real node verdict-line still listed");
    // Sorted + de-duped.
    assert.deepEqual(buildable, [...buildable].sort());
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("nodeHelp lists spec-borne nodes; a malformed spec is SKIPPED, never blanks the list", async () => {
  const dir = await fixtureSpecBorneStories({ withMalformed: true });
  try {
    const env = nodeHelp(dir);
    assert.equal(env.ok, true);
    // The self-registered node shows in the help discovery surface.
    assert.match(env.body, /cap-spec-borne/);
    // The malformed sibling is skipped (no throw) and the registry nodes still render.
    assert.doesNotMatch(env.body, /cap-bad/);
    assert.match(env.body, /library-cli/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ── `node resolve` (FREE, read-only — the gap the blind dogfood test surfaced) ───────────────────

test("node resolve on a spec-borne REAL node shows source=spec, REAL-buildable + the real proof display", async () => {
  const env = await run(["node", "resolve", "verdict-line"], deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /node resolve verdict-line/);
  assert.match(env.body, /stories\/drive-machinery\/verdict-line\.md/);
  assert.match(env.body, /contract-test → contract/);
  assert.match(env.body, /buildable: +yes — source: spec/);
  assert.match(env.body, /REAL-buildable: yes/);
  // The real proof display is the orchestrator's one-true display, not hand-formatted.
  assert.match(env.body, /real proof: +node --import tsx --test packages\/orchestrator\/src\/proof\/verdict-line\.test\.ts/);
  // Read-only: zero-cost next steps, no spend implied by the resolve itself.
  assert.ok(env.next?.some((n) => n.includes("--dry-run")));
  assert.ok(env.next?.some((n) => n.includes("--real")));
});

test("node resolve on the dogfood node (node-resolve-report) resolves spec-borne + REAL-buildable", async () => {
  const env = await run(["node", "resolve", "node-resolve-report"], deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /buildable: +yes — source: spec/);
  assert.match(env.body, /REAL-buildable: yes/);
  assert.match(env.body, /packages\/drive\/src\/resolve-report\.test\.ts/);
});

test("node resolve on library-cli shows source=spec but NOT real-buildable (the ADR-0092 real arm removed, ADR-0094)", async () => {
  // ADR-0094 removed the library's brownfield `real:` arms (ADR-0092 d.5, supersedes_in_part): the
  // library is `mapped`, so its honest path to green is Adopt (`## Reliability Gates`, ADR-0085), not a
  // fail-closed `--real` Build. library-cli keeps its spec-borne dry-run/live `command`+`scope` (source:
  // spec, single-node `--live`-buildable) but no longer carries a `real:` arm, so it is NOT real-buildable.
  const env = await run(["node", "resolve", "library-cli"], deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /buildable: +yes — source: spec/);
  assert.match(env.body, /REAL-buildable: no/);
});

test("node resolve on a non-buildable node fails closed, naming BOTH routes out", async () => {
  // browse-library: a real spec with neither a spec-borne proof: block nor a registry entry.
  const env = await run(["node", "resolve", "browse-library"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /NOT BUILDABLE/);
  assert.match(env.body, /has no proof config/);
  assert.match(env.body, /'proof:' block/);
  assert.match(env.body, /test-command registry/);
});

test("node resolve on an unknown id is guidance listing buildable nodes", async () => {
  const env = await run(["node", "resolve", "no-such-node"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /no node spec "no-such-node"/);
  assert.ok(env.next?.some((n) => n.includes("storytree node resolve")));
});

// ── ADR-0064: resolveDbProofEnv — the CLI's first honesty wall for a db-backed proof ─────────────

test("resolveDbProofEnv defaults to the canonical disposable test DB when STORYTREE_DB_NAME is unset", () => {
  const savedName = process.env["STORYTREE_DB_NAME"];
  const savedUser = process.env["STORYTREE_DB_USER"];
  try {
    delete process.env["STORYTREE_DB_NAME"];
    process.env["STORYTREE_DB_USER"] = "iam@example.com";
    const res = resolveDbProofEnv();
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.dbName, DEFAULT_TEST_DB_NAME);
    assert.equal(res.env["STORYTREE_DB_NAME"], DEFAULT_TEST_DB_NAME);
    // The IAM user (keyless auth) is carried through for the worktree proof to authenticate.
    assert.equal(res.env["STORYTREE_DB_USER"], "iam@example.com");
  } finally {
    if (savedName === undefined) delete process.env["STORYTREE_DB_NAME"];
    else process.env["STORYTREE_DB_NAME"] = savedName;
    if (savedUser === undefined) delete process.env["STORYTREE_DB_USER"];
    else process.env["STORYTREE_DB_USER"] = savedUser;
  }
});

test("resolveDbProofEnv honors an explicit disposable STORYTREE_DB_NAME override", () => {
  const saved = process.env["STORYTREE_DB_NAME"];
  try {
    process.env["STORYTREE_DB_NAME"] = "storytree_test_alt";
    const res = resolveDbProofEnv();
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.dbName, "storytree_test_alt");
  } finally {
    if (saved === undefined) delete process.env["STORYTREE_DB_NAME"];
    else process.env["STORYTREE_DB_NAME"] = saved;
  }
});

test("resolveDbProofEnv REFUSES production (STORYTREE_DB_NAME=storytree) — fail-closed, the first wall", () => {
  const saved = process.env["STORYTREE_DB_NAME"];
  try {
    process.env["STORYTREE_DB_NAME"] = "storytree"; // PRODUCTION
    const res = resolveDbProofEnv();
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.refusal.body, /ISOLATED test database, never production|PRODUCTION/i);
  } finally {
    if (saved === undefined) delete process.env["STORYTREE_DB_NAME"];
    else process.env["STORYTREE_DB_NAME"] = saved;
  }
});

// ── ADR-0064 §2: guarded dependency adds — the CLI derivation + group resolution ─────────────────

test("workspacePackageForSource derives the workspace package name from a packages/<dir> source file", () => {
  // Reads the real packages/<dir>/package.json name (the honest source, not a path-convention guess).
  assert.equal(workspacePackageForSource("packages/proof-protocol/src/anchor.ts"), "@storytree/proof-protocol");
  assert.equal(workspacePackageForSource("packages/orchestrator/src/store/pg-change-store.ts"), "@storytree/orchestrator");
  // Not under a workspace package → null (the caller refuses).
  assert.equal(workspacePackageForSource("docs/decisions/x.md"), null);
  assert.equal(workspacePackageForSource("apps/studio/src/x.ts"), null);
});

test("resolveAddDepsGroup: none declared → null; declared → a group targeting the derived package", () => {
  const noDeps: RealProofConfig = {
    testFile: "packages/core/src/x.test.ts",
    sourceFile: "packages/core/src/x.ts",
    scope: { testGlobs: ["packages/core/src/x.test.ts"], sourceGlobs: ["packages/core/src/x.ts"] },
  };
  const none = resolveAddDepsGroup(noDeps);
  assert.equal(none.ok, true);
  if (none.ok) assert.equal(none.group, null);

  const withDeps: RealProofConfig = {
    testFile: "packages/proof-protocol/src/anchor.test.ts",
    sourceFile: "packages/proof-protocol/src/anchor.ts",
    scope: { testGlobs: ["packages/proof-protocol/src/anchor.test.ts"], sourceGlobs: ["packages/proof-protocol/src/anchor.ts"] },
    install: true,
    typecheck: { file: "pnpm", args: ["--filter", "@storytree/proof-protocol", "typecheck"] },
    addDeps: ["tree-sitter", "tree-sitter-typescript@0.21.0"],
  };
  const grouped = resolveAddDepsGroup(withDeps);
  assert.equal(grouped.ok, true);
  if (grouped.ok) {
    assert.deepEqual(grouped.group, {
      packageName: "@storytree/proof-protocol",
      deps: ["tree-sitter", "tree-sitter-typescript@0.21.0"],
    });
  }
});

test("resolveAddDepsGroup REFUSES when the target package can't be derived (source not under packages/)", () => {
  const badSource: RealProofConfig = {
    testFile: "scripts/x.test.ts",
    sourceFile: "scripts/x.ts",
    scope: { testGlobs: ["scripts/x.test.ts"], sourceGlobs: ["scripts/x.ts"] },
    install: true,
    typecheck: { file: "pnpm", args: ["-r", "typecheck"] },
    addDeps: ["tree-sitter"],
  };
  const res = resolveAddDepsGroup(badSource);
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.refusal.body, /target workspace package could not be derived/);
});

// ── --emit-wisp: the dry-run wisp SMOKE (ADR-0080) ────────────────────────────

/** A minimal fake work store for the emit-wisp wiring tests (records appends + the smoke delete). */
function fakeWispStore(): { store: WispSmokeStore; kinds: string[]; deleted: Array<[string, string]> } {
  const kinds: string[] = [];
  const deleted: Array<[string, string]> = [];
  const store: WispSmokeStore = {
    appendEvent: async (e) => {
      kinds.push(e.kind);
      return e;
    },
    deleteWorkEvent: async (unitId, runId) => {
      deleted.push([unitId, runId]);
      return 1;
    },
  };
  return { store, kinds, deleted };
}

test("node build --emit-wisp WITHOUT --dry-run is refused (live/real already light real wisps)", async () => {
  const env = await run(
    ["node", "build", "library-cli", "--live", "--emit-wisp", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /DRY-RUN smoke/);
});

test("node build --dry-run --emit-wisp --dwell 0 is refused (dwell must be positive) — no DB touched", async () => {
  const env = await run(
    ["node", "build", "library-cli", "--dry-run", "--emit-wisp", "--dwell", "0", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /--dwell must be a positive number/);
});

test("node build --dry-run --emit-wisp drives the smoke: building appended + deleted for the REAL node, never a verdict", async () => {
  const { store, kinds, deleted } = fakeWispStore();
  const env = await nodeBuild("library-cli", {
    dryRun: true,
    emitWisp: true,
    dwellSec: 1,
    actor: "tester@example.com",
    wispDeps: {
      ensureDb: async () => ({ ok: true, started: false }),
      openStore: async () => ({ store, close: async () => {} }),
      sleep: async () => {}, // no-op: the dwell decrements its own budget, so it terminates instantly
      log: () => {},
      installSigintCleanup: () => () => {},
      studioUrl: "http://localhost:5173",
    },
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /wisp smoke library-cli — DRY-RUN/);
  assert.deepEqual(kinds, ["work"], "only a work event is appended — never a verdict");
  assert.equal(deleted.length, 1, "the transient row is hard-deleted once");
  assert.equal(deleted[0]![0], "library-cli");
  assert.match(deleted[0]![1]!, /^wisp-smoke-/);
});

// ── ADR-0121: the per-unit write-claim wired into the build (refuse a second concurrent builder) ──

/** A fake claim store recording every claim/release; `acquired` decides the claim outcome. */
function fakeClaimStore(acquired: boolean): {
  store: ClaimStoreLike;
  claims: string[];
  releases: Array<[string, string]>;
} {
  const claims: string[] = [];
  const releases: Array<[string, string]> = [];
  const at = "2026-06-27T00:00:00.000Z";
  const store: ClaimStoreLike = {
    claim: async (req) => {
      claims.push(req.unitId);
      return acquired
        ? {
            acquired: true,
            claim: { unitId: req.unitId, sessionId: req.sessionId, branch: req.branch, intent: req.intent ?? "", claimedAt: at, heartbeatAt: at },
            reclaimed: false,
          }
        : {
            acquired: false,
            heldBy: { unitId: req.unitId, sessionId: "other-session-xyz", branch: "claude/other", intent: "real", claimedAt: at, heartbeatAt: at },
          };
    },
    release: async (unitId, sessionId) => {
      releases.push([unitId, sessionId]);
      return true;
    },
  };
  return { store, claims, releases };
}

const CLAIM_IDENTITY: SessionIdentity = { sessionId: "this-session-abc", branch: "claude/this" };

test("node build REFUSES when another live session already holds the unit's claim (ADR-0121)", async () => {
  const { store, claims, releases } = fakeClaimStore(false);
  const env = await nodeBuild("library-cli", {
    dryRun: true,
    actor: "tester@example.com",
    claim: { store },
    identity: CLAIM_IDENTITY, // identity is what makes the claim fire (ADR-0199: claim-only, never presence)
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /already being built by another live session/);
  assert.match(env.body, /REFUSED \(ADR-0121\)/);
  assert.match(env.body, /other-session-xyz/); // the holder is named
  assert.deepEqual(claims, ["library-cli"], "claimed the unit once");
  assert.equal(releases.length, 0, "nothing to release — the claim was never held by us");
  assert.doesNotMatch(env.body, /verdict: {5}PASS/, "the gate never ran on a refused build");
  assert.ok(env.next?.some((n) => n.includes("noticeboard")));
});

test("node build ACQUIRES the claim, runs the gate, and RELEASES it on success (ADR-0121)", async () => {
  const { store, claims, releases } = fakeClaimStore(true);
  const env = await nodeBuild("library-cli", {
    dryRun: true,
    actor: "tester@example.com",
    claim: { store },
    identity: CLAIM_IDENTITY,
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /verdict: {5}PASS/, "the gate ran once the claim was held");
  assert.deepEqual(claims, ["library-cli"], "claimed once");
  assert.deepEqual(releases, [["library-cli", "this-session-abc"]], "released once, by this session");
});

test("node build does NOT claim when identity is absent (a non-worktree build does not contend)", async () => {
  const { store, claims } = fakeClaimStore(false); // would refuse IF consulted
  const env = await nodeBuild("library-cli", {
    dryRun: true,
    actor: "tester@example.com",
    claim: { store },
    identity: null, // no worktree identity → no claim, build proceeds
  });
  assert.equal(env.ok, true, env.body);
  assert.equal(claims.length, 0, "claim store never consulted without an identity");
});
