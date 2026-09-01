/**
 * `storytree context` — the render, and the two refusals around it (`linked-session-context-arc`,
 * increment `hand-a-running-session-its-own-occupancy`).
 *
 * The FOLD is proved next door, over real transcript bytes
 * (`packages/context-traversal-transcript/src/context-windows.test.ts`). What is proved HERE is the
 * half this file actually owns: that the identity refusal fires in the lobby, that the harness's
 * window id is passed through as a selector, and — the load-bearing one — that an ABSENCE renders as
 * an absence. A session handed "0 tokens resident" when the truth is "I could not read your window"
 * takes on work it has no room for, which is the exact failure ADR-0411 D6 exists to prevent, so the
 * absence render is pinned on its own words rather than on the envelope's `ok`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { OwnWindowArgs, OwnWindowRead, WindowOccupancy } from "@storytree/context-traversal-transcript";

import { contextCommand, contextHelp, type ContextDeps } from "./context.js";

const NOW = Date.parse("2026-08-26T12:00:00Z");

function occupancy(overrides: Partial<WindowOccupancy> = {}): WindowOccupancy {
  return {
    windowId: "a2e1e82e-b05c-432d-84e6-19440160bf5f",
    residentTokens: 225_013,
    peakTokens: 225_013,
    observationCount: 54,
    syntheticObservations: 0,
    modelId: "claude-opus-5",
    lastObservedAt: "2026-08-26T11:58:00Z",
    lastWrittenAt: "2026-08-26T11:58:00Z",
    ...overrides,
  };
}

function reading(overrides: Partial<OwnWindowRead> = {}): OwnWindowRead {
  return {
    sessionId: "angry-hopper-092898",
    scan: { root: "/tmp/projects", windowFilesFound: 3219, windowFilesRead: 60, candidateLimit: 60, correlatedWindows: 4 },
    window: occupancy(),
    band: "calm",
    absence: null,
    selectedBy: "harness-window-id",
    harnessWindowUnmatched: false,
    ...overrides,
  };
}

function deps(overrides: Partial<ContextDeps> = {}): ContextDeps {
  return {
    sessionId: () => "angry-hopper-092898",
    env: {},
    read: () => reading(),
    now: () => NOW,
    ...overrides,
  };
}

test("the primary checkout is refused, and the refusal says why a guess would be worse", () => {
  const env = contextCommand(deps({ sessionId: () => null }));

  assert.equal(env.ok, false);
  assert.match(env.body, /needs a session identity/);
  // The reason has to be the SPECIFIC one, not a generic identity boilerplate: without a worktree
  // there is nothing for a recorded `cwd` to match, so any answer would be somebody else's window.
  assert.match(env.body, /working directory/i);
  assert.match(env.body, /somebody else's number/i);
});

test("a reading prints the figure, its band and D3's own marks", () => {
  const env = contextCommand(deps());

  assert.equal(env.ok, true);
  assert.match(env.body, /225,013 tokens/);
  assert.match(env.body, /CALM/);
  assert.match(env.body, /room for another increment/);
  assert.match(env.body, /soft ~700k · hard 850k/);
  assert.match(env.body, /a2e1e82e-b05c-432d-84e6-19440160bf5f/);
  // The caveat that stops a low number on a fan-out session reading as a broken instrument.
  assert.match(env.body, /ADR-0413 D2/);
  assert.match(env.body, /increment boundary/i);
});

test("each band is labelled and carries its own instruction", () => {
  const soft = contextCommand(deps({ read: () => reading({ window: occupancy({ residentTokens: 437_477 }), band: "soft" }) }));
  assert.match(soft.body, /SOFT MARK/);
  assert.match(soft.body, /no new increment/i);

  const hard = contextCommand(deps({ read: () => reading({ window: occupancy({ residentTokens: 512_000 }), band: "hard" }) }));
  assert.match(hard.body, /HARD MARK/);
  assert.match(hard.body, /fresh session continue/);
});

test("an ABSENCE renders as an absence, never as a zero, and routes to ADR-0411 D6", () => {
  const env = contextCommand(
    deps({ read: () => reading({ window: null, band: null, absence: "no-readable-occupancy", selectedBy: null }) }),
  );

  assert.equal(env.ok, true, "a truthful 'I could not read it' is the command working, not failing");
  assert.match(env.body, /NO READING/);
  assert.match(env.body, /not a zero/i);
  assert.match(env.body, /ADR-0411 D6/);
  assert.match(env.body, /estimated/i);
  // It must never print a token figure it does not have.
  assert.ok(!/resident:/.test(env.body), `an absence printed a resident figure:\n${env.body}`);
});

test("each absence reason sends the reader somewhere different", () => {
  const noRoot = contextCommand(deps({ read: () => reading({ window: null, band: null, absence: "no-transcript-root" }) }));
  assert.match(noRoot.body, /No session transcript exists/);

  const noneMine = contextCommand(
    deps({ read: () => reading({ window: null, band: null, absence: "no-correlated-window" }) }),
  );
  assert.match(noneMine.body, /worktree \(angry-hopper-092898\)/);
});

test("every render says WHERE it looked and how far, so an absence is not a bare 'not found'", () => {
  for (const read of [reading(), reading({ window: null, band: null, absence: "no-correlated-window" })]) {
    const env = contextCommand(deps({ read: () => read }));
    assert.match(env.body, /the 60 most recently written of 3219 session transcripts/);
    assert.match(env.body, /root:\s+\/tmp\/projects/);
  }
});

test("the harness window id is passed through as a selector, and a blank one is not", () => {
  const seen: OwnWindowArgs[] = [];
  const capture = (args: OwnWindowArgs): OwnWindowRead => {
    seen.push(args);
    return reading();
  };

  contextCommand(deps({ env: { CLAUDE_CODE_SESSION_ID: " a2e1e82e-b05c-432d-84e6-19440160bf5f " }, read: capture }));
  assert.equal(seen[0]?.harnessWindowId, "a2e1e82e-b05c-432d-84e6-19440160bf5f", "it must arrive trimmed");

  contextCommand(deps({ env: { CLAUDE_CODE_SESSION_ID: "   " }, read: capture }));
  assert.equal(seen[1]?.harnessWindowId, undefined, "a blank env var is no hint at all, not an empty-string hint");

  contextCommand(deps({ env: {}, read: capture }));
  assert.equal(seen[2]?.harnessWindowId, undefined);
  assert.equal(seen[2]?.sessionId, "angry-hopper-092898");
});

test("how the window was identified is stated — an unconfirmed pick never reads as a confirmed one", () => {
  const confirmed = contextCommand(deps());
  assert.match(confirmed.body, /identity:\s+confirmed/);

  const unconfirmed = contextCommand(deps({ read: () => reading({ selectedBy: "latest-activity" }) }));
  assert.match(unconfirmed.body, /identity:\s+unconfirmed/);

  const disagreed = contextCommand(
    deps({ read: () => reading({ selectedBy: "latest-activity", harnessWindowUnmatched: true }) }),
  );
  assert.match(disagreed.body, /UNCONFIRMED/);
});

test("the compaction note appears only when peak actually exceeds the current reading", () => {
  const flat = contextCommand(deps());
  assert.ok(!/COMPACTED/.test(flat.body), "the note is noise on the common case where the two figures agree");

  const compacted = contextCommand(
    deps({ read: () => reading({ window: occupancy({ residentTokens: 120_000, peakTokens: 460_000 }) }) }),
  );
  assert.match(compacted.body, /COMPACTED/);
  assert.match(compacted.body, /ADR-0248 D1/);
});

test("the synthetic exclusion is reported when it bit, and silent when it did not", () => {
  const none = contextCommand(deps());
  assert.ok(!/synthetic/.test(none.body));

  const one = contextCommand(deps({ read: () => reading({ window: occupancy({ syntheticObservations: 1 }) }) }));
  assert.match(one.body, /1 synthetic reading excluded/);

  const many = contextCommand(deps({ read: () => reading({ window: occupancy({ syntheticObservations: 3 }) }) }));
  assert.match(many.body, /3 synthetic readings excluded/);
});

test("help names the marks and says it enforces nothing", () => {
  const env = contextHelp();

  assert.equal(env.ok, true);
  assert.match(env.body, /~700k/);
  assert.match(env.body, /850k/);
  assert.match(env.body, /never enforces/i);
  assert.match(env.body, /ESTIMATED/);
});

test("every surface that states a mark also says what the mark asks for", () => {
  // ADR-0499 D2-D4. The measured failure was a session reading the soft mark as a spend budget and
  // economising on the work in hand, so the number must never appear anywhere without the clause
  // that says what it governs. All THREE surfaces print a mark: the reading, the absence fallback
  // (which restates the marks precisely because it has no figure), and the help.
  const withFigure = contextCommand(deps());
  const absent = contextCommand(
    deps({ read: () => reading({ window: null, band: null, absence: "no-correlated-window", selectedBy: null }) }),
  );

  for (const body of [withFigure.body, absent.body, contextHelp().body]) {
    assert.match(body, /NEXT unit/, "a mark is stated without saying what it governs");
    assert.match(body, /cross it/i, "crossing a mark mid-increment is the expected case, not a failure");
  }

  // The ABSENCE render restates both marks in words precisely because it has no figure to band —
  // it is the one branch a session reads when `storytree context` cannot help it, so a tune that
  // left these two numbers behind would mislead exactly the session with the least to go on.
  assert.match(absent.body, /no new increment past ~700k/i);
  assert.match(absent.body, /hand over at 850k/i);
});
