// Integration test for pty-session-manager.ts
//
// WHAT IT PINS: PtySessionManager is the Electron-main pty LIFECYCLE — over an injected
// PtyPort it spawns a pty handle on create(), wires the handle's onData to the session's
// registered data sink and its onExit to teardown, forwards write()/resize() to the
// addressed session's handle, and dispose()s (kills + frees the id) — tracking MULTIPLE
// independent sessions and failing closed (typed false/no-op, never a throw) on an
// unknown or already-disposed session id. A disposed session's late pty onData (a race
// after kill) is dropped, not routed to a freed sink.
//
// INJECTED FAKE: the test builds a fake PtyPort whose spawn() returns a fake handle that
// RECORDS write/resize/kill calls and can be COMMANDED to emit onData chunks and onExit —
// the same discipline broker.test.ts uses with InMemoryKeychain. No real node-pty, no
// Electron, no child process.
//
// DELETION TEST: removing PtySessionManager breaks every import below. Removing the
// onData/onExit wiring breaks the routing assertions. Removing the fail-closed guards
// turns an unknown-id call into a throw. Removing per-session isolation lets a call
// addressed to one session leak onto another's handle.

import { test } from "node:test";
import assert from "node:assert/strict";

// RED: pty-session-manager.ts does not exist yet — module-not-found is the right-kind red.
import { PtySessionManager } from "./pty-session-manager.js";
import type { PtyPort, PtyHandle, PtySpawnOptions } from "./pty-session-manager.js";

// ---------------------------------------------------------------------------
// Fake pty port — the injected seam. Records outbound calls, and exposes emitData/
// emitExit so the test can command inbound pty events deterministically.
// ---------------------------------------------------------------------------

class FakePtyHandle implements PtyHandle {
  readonly writes: string[] = [];
  readonly resizes: Array<{ cols: number; rows: number }> = [];
  killCount = 0;
  pauseCount = 0;
  resumeCount = 0;
  #dataCb: ((chunk: string) => void) | undefined;
  #exitCb: ((e: { exitCode: number }) => void) | undefined;

  onData(cb: (chunk: string) => void): void {
    this.#dataCb = cb;
  }

  onExit(cb: (e: { exitCode: number }) => void): void {
    this.#exitCb = cb;
  }

  write(data: string): void {
    this.writes.push(data);
  }

  resize(cols: number, rows: number): void {
    this.resizes.push({ cols, rows });
  }

  pause(): void {
    this.pauseCount += 1;
  }

  resume(): void {
    this.resumeCount += 1;
  }

  kill(): void {
    this.killCount += 1;
  }

  /** Test-only: command the fake pty to emit a data chunk, as the real process would. */
  emitData(chunk: string): void {
    this.#dataCb?.(chunk);
  }

  /** Test-only: command the fake pty to emit its exit, as the real process would. */
  emitExit(e: { exitCode: number }): void {
    this.#exitCb?.(e);
  }
}

class FakePtyPort implements PtyPort {
  readonly spawned: Array<{ opts: PtySpawnOptions; handle: FakePtyHandle }> = [];

  spawn(opts: PtySpawnOptions): PtyHandle {
    const handle = new FakePtyHandle();
    this.spawned.push({ opts, handle });
    return handle;
  }
}

const BASE_OPTS: PtySpawnOptions = { cols: 80, rows: 24, shell: "bash", cwd: "/tmp/work" };

/** Outwait the manager's data-batching flush window (default 5 ms — increment B), so an
 *  assertion on the routed sink sees the coalesced flush, not the pre-flush quiet. */
function flushWindow(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

// ---------------------------------------------------------------------------
// spawn + routing
// ---------------------------------------------------------------------------

test("psm-spawns-and-routes-data: create() spawns via the port with the given options and wires onData to the sink", async () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const received: Array<{ sessionId: string; chunk: string }> = [];

  const sessionId = manager.create(
    BASE_OPTS,
    (sid, chunk) => received.push({ sessionId: sid, chunk }),
    () => {},
  );

  assert.equal(port.spawned.length, 1);
  assert.deepEqual(port.spawned[0]?.opts, BASE_OPTS);
  assert.equal(typeof sessionId, "string");
  assert.ok(sessionId.length > 0);

  const handle = port.spawned[0]?.handle;
  assert.ok(handle);
  handle.emitData("hello from the shell\n");
  await flushWindow();

  assert.deepEqual(received, [{ sessionId, chunk: "hello from the shell\n" }]);
});

test("psm-forwards-input-and-resize: write() forwards typed input to the addressed session's pty handle", () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const sessionId = manager.create(BASE_OPTS, () => {}, () => {});
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  const ok = manager.write(sessionId, "ls -la\n");

  assert.equal(ok, true);
  assert.deepEqual(handle.writes, ["ls -la\n"]);
});

test("psm-forwards-input-and-resize: resize() forwards cols/rows to the addressed session's pty handle", () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const sessionId = manager.create(BASE_OPTS, () => {}, () => {});
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  const ok = manager.resize(sessionId, 120, 40);

  assert.equal(ok, true);
  assert.deepEqual(handle.resizes, [{ cols: 120, rows: 40 }]);
});

// ---------------------------------------------------------------------------
// dispose + exit teardown
// ---------------------------------------------------------------------------

test("psm-disposes-and-tears-down: dispose() kills the pty, frees the session id, and reports it gone", () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const sessionId = manager.create(BASE_OPTS, () => {}, () => {});
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  assert.equal(manager.has(sessionId), true);
  const ok = manager.dispose(sessionId);

  assert.equal(ok, true);
  assert.equal(handle.killCount, 1);
  assert.equal(manager.has(sessionId), false);
});

test("psm-disposes-and-tears-down: the pty's own exit tears the session down and routes the typed onExit event once", () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const exits: Array<{ sessionId: string; exitCode: number }> = [];
  const sessionId = manager.create(
    BASE_OPTS,
    () => {},
    (sid, e) => exits.push({ sessionId: sid, exitCode: e.exitCode }),
  );
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  handle.emitExit({ exitCode: 0 });

  assert.deepEqual(exits, [{ sessionId, exitCode: 0 }]);
  assert.equal(manager.has(sessionId), false);

  // Torn down already — a second dispose is a no-op, never a throw, and the pty is not
  // killed again (the process already exited on its own).
  const secondDispose = manager.dispose(sessionId);
  assert.equal(secondDispose, false);
  assert.equal(handle.killCount, 0);
});

test("psm-disposes-and-tears-down: a late onData after dispose is dropped, not routed to the freed sink", async () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const received: string[] = [];
  const sessionId = manager.create(BASE_OPTS, (_sid, chunk) => received.push(chunk), () => {});
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  manager.dispose(sessionId);
  // A race: the underlying process still flushes a buffered chunk after kill().
  handle.emitData("buffered output after kill\n");
  await flushWindow();

  assert.deepEqual(received, []);
});

// ---------------------------------------------------------------------------
// fail-closed on unknown / disposed ids
// ---------------------------------------------------------------------------

test("psm-fails-closed-on-unknown-session: write/resize/dispose on an unknown session id fail closed — false, never a throw", () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);

  assert.equal(manager.has("no-such-session"), false);
  assert.doesNotThrow(() => {
    assert.equal(manager.write("no-such-session", "data\n"), false);
    assert.equal(manager.resize("no-such-session", 80, 24), false);
    assert.equal(manager.dispose("no-such-session"), false);
  });
});

test("psm-fails-closed-on-unknown-session: write/resize on an already-disposed session id fail closed — false, never a throw", () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const sessionId = manager.create(BASE_OPTS, () => {}, () => {});
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);
  manager.dispose(sessionId);

  assert.doesNotThrow(() => {
    assert.equal(manager.write(sessionId, "too late\n"), false);
    assert.equal(manager.resize(sessionId, 100, 30), false);
  });
  // Nothing further reaches the (already-killed) handle.
  assert.deepEqual(handle.writes, []);
  assert.deepEqual(handle.resizes, []);
});

// ---------------------------------------------------------------------------
// multi-session isolation
// ---------------------------------------------------------------------------

test("psm-isolates-multiple-sessions: concurrent sessions are isolated — routing and disposal never cross session boundaries", async () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const receivedA: string[] = [];
  const receivedB: string[] = [];

  const sessionA = manager.create(BASE_OPTS, (_sid, chunk) => receivedA.push(chunk), () => {});
  const sessionB = manager.create(
    { cols: 100, rows: 30, shell: "zsh" },
    (_sid, chunk) => receivedB.push(chunk),
    () => {},
  );
  assert.notEqual(sessionA, sessionB);
  assert.equal(manager.size, 2);

  const handleA = port.spawned[0]?.handle;
  const handleB = port.spawned[1]?.handle;
  assert.ok(handleA);
  assert.ok(handleB);

  manager.write(sessionA, "for A\n");
  manager.resize(sessionB, 132, 50);

  assert.deepEqual(handleA.writes, ["for A\n"]);
  assert.deepEqual(handleB.writes, []);
  assert.deepEqual(handleA.resizes, []);
  assert.deepEqual(handleB.resizes, [{ cols: 132, rows: 50 }]);

  handleA.emitData("chunk for A\n");
  handleB.emitData("chunk for B\n");
  await flushWindow();
  assert.deepEqual(receivedA, ["chunk for A\n"]);
  assert.deepEqual(receivedB, ["chunk for B\n"]);

  // Disposing A must not touch B.
  manager.dispose(sessionA);
  assert.equal(manager.has(sessionA), false);
  assert.equal(manager.has(sessionB), true);
  assert.equal(handleA.killCount, 1);
  assert.equal(handleB.killCount, 0);
  assert.equal(manager.size, 1);
});

// ---------------------------------------------------------------------------
// snapshot() — the serialized headless-screen state (contract 6, ADR-0190:
// supersedes the ADR-0189 raw-byte scrollback ring — replaying raw output
// bytes into a fresh, differently-sized xterm reconstructs interleaved TUI
// fragments, not the screen. The manager now holds a per-session headless
// xterm Terminal, writes every routed chunk through it, and resizes it
// alongside the pty. snapshot() is ASYNC and resolves the @xterm/addon-
// serialize serialization of the parsed screen plus the tracked dims —
// never the raw chunk join — flushed so it reflects every chunk received
// before the call.
// ---------------------------------------------------------------------------

test("psm-snapshots-serialized-screen-state: snapshot() resolves the serialized parsed screen and tracked dims, reflecting every routed chunk and a later resize, and fails closed to null for an unknown or disposed session", async () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const sessionId = manager.create(BASE_OPTS, () => {}, () => {});
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  handle.emitData("hello from the shell\r\n");
  handle.emitData("second line\r\n");

  const snap = await manager.snapshot(sessionId);

  assert.ok(snap !== null);
  assert.equal(typeof snap?.data, "string");
  assert.match(snap!.data, /hello from the shell/);
  assert.match(snap!.data, /second line/);
  assert.equal(snap?.cols, 80);
  assert.equal(snap?.rows, 24);

  // resize() must be tracked, so a later snapshot reports the live dims.
  manager.resize(sessionId, 100, 30);
  const afterResize = await manager.snapshot(sessionId);
  assert.equal(afterResize?.cols, 100);
  assert.equal(afterResize?.rows, 30);

  // Fail-closed: an unknown session id resolves null, never a throw.
  assert.equal(await manager.snapshot("no-such-session"), null);

  // The headless terminal is freed with the session on dispose.
  manager.dispose(sessionId);
  assert.equal(await manager.snapshot(sessionId), null);
});

// ---------------------------------------------------------------------------
// Unicode 11 width tables (contract 8 — rendering-correctness parity, the
// embedded-terminal patterns survey increment A): xterm defaults to UNICODE 6
// widths, which mis-measure emoji/spinner glyphs (Claude Code's staple output).
// The renderer terminal activates Unicode 11 (TerminalDock, its own vitest
// contract); the headless snapshot terminal here must match — ONE-SIDED width
// tables make a re-attach replay re-wrap differently than the live rendering
// did. This runs the REAL @xterm/addon-unicode11 against the real headless
// core: U+26A1 (⚡) measures 1 cell under Unicode 6 but 2 under Unicode 11.
// ---------------------------------------------------------------------------

test("psm-unicode11-wide-glyph-width: the headless screen model measures a wide emoji at 2 cells (Unicode 11), so a 4-column row wraps where Unicode 6 would not", async () => {
  const port = new FakePtyPort();
  // scrollback 0 + a single 4-column row: a wrapped-out first row is DROPPED, so the surviving
  // serialized content differs by width table. "ab⚡" fills the row only when ⚡ is 2 cells wide
  // (2+2=4, Unicode 11) — "x" then wraps and the first row scrolls out. Under Unicode 6 widths
  // (⚡ = 1 cell) all four glyphs fit the row and "ab" survives — the red this contract pins.
  const manager = new PtySessionManager(port, { scrollbackLines: 0 });
  const sessionId = manager.create({ cols: 4, rows: 1 }, () => {}, () => {});
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  handle.emitData("ab⚡x");

  const snap = await manager.snapshot(sessionId);
  assert.ok(snap !== null);
  assert.match(snap!.data, /x/);
  assert.doesNotMatch(snap!.data, /ab/);
});

// ---------------------------------------------------------------------------
// list() — the live-session enumeration (contract 7 — re-attach discovery,
// ADR-0189: the Electron-main glue scopes re-attach per repo via the cwd this
// reports; the manager itself reports facts only, no policy).
// ---------------------------------------------------------------------------

test("psm-lists-live-sessions: list() reports live sessions in creation order with their spawn cwd, dropping disposed or self-exited sessions", () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);

  const sessionA = manager.create(BASE_OPTS, () => {}, () => {});
  const sessionB = manager.create(
    { cols: 100, rows: 30, shell: "zsh" }, // no cwd given
    () => {},
    () => {},
  );
  const sessionC = manager.create({ cols: 80, rows: 24, cwd: "/repo/two" }, () => {}, () => {});

  assert.deepEqual(manager.list(), [
    { sessionId: sessionA, cwd: "/tmp/work" },
    { sessionId: sessionB, cwd: null },
    { sessionId: sessionC, cwd: "/repo/two" },
  ]);

  // A disposed session drops out of the enumeration.
  manager.dispose(sessionA);
  assert.deepEqual(manager.list(), [
    { sessionId: sessionB, cwd: null },
    { sessionId: sessionC, cwd: "/repo/two" },
  ]);

  // A session that exits on its own also drops out — list() reports live sessions only.
  const handleB = port.spawned[1]?.handle;
  assert.ok(handleB);
  handleB.emitExit({ exitCode: 0 });
  assert.deepEqual(manager.list(), [{ sessionId: sessionC, cwd: "/repo/two" }]);
});

// ---------------------------------------------------------------------------
// batching (contract 9 — throughput, the embedded-terminal patterns survey
// increment B): today one sink call fires per pty chunk, so a fast producer
// (a `pnpm gate` in the dock) floods the IPC wire one message per chunk. The
// VS Code TerminalDataBufferer pattern: coalesce a session's chunks inside a
// short flush window (5 ms) and flush them as ONE JOINED string — the
// (sessionId, chunk) wire shape is unchanged, there are just fewer, larger
// sink calls, order preserved. Per-session: one session's flush never carries
// a sibling's bytes.
// ---------------------------------------------------------------------------

test("psm-batches-chunks-into-one-flush: chunks arriving inside the flush window reach the sink as ONE joined string, order preserved; a later chunk starts a fresh batch", async () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const received: Array<{ sessionId: string; chunk: string }> = [];
  const sessionId = manager.create(
    BASE_OPTS,
    (sid, chunk) => received.push({ sessionId: sid, chunk }),
    () => {},
  );
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  handle.emitData("a");
  handle.emitData("b");
  handle.emitData("c");

  // Inside the flush window nothing has reached the sink yet — the chunks are coalescing.
  assert.deepEqual(received, []);

  await flushWindow();
  assert.deepEqual(received, [{ sessionId, chunk: "abc" }]);

  // A chunk after the flush starts a FRESH batch — never re-delivers the flushed bytes.
  handle.emitData("d");
  await flushWindow();
  assert.deepEqual(received, [
    { sessionId, chunk: "abc" },
    { sessionId, chunk: "d" },
  ]);
});

test("psm-flushes-pending-batch-before-exit: a pending batch is flushed to the sink BEFORE the exit routes — joined, in order, never dropped", () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const events: Array<{ type: "data"; chunk: string } | { type: "exit"; exitCode: number }> = [];
  manager.create(
    BASE_OPTS,
    (_sid, chunk) => events.push({ type: "data", chunk }),
    (_sid, e) => events.push({ type: "exit", exitCode: e.exitCode }),
  );
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  handle.emitData("almost ");
  handle.emitData("done");
  handle.emitExit({ exitCode: 0 });

  // The pending coalesced batch lands first (one joined sink call), then the exit — so the
  // renderer's '[process exited]' line can never precede (or swallow) the session's last output.
  assert.deepEqual(events, [
    { type: "data", chunk: "almost done" },
    { type: "exit", exitCode: 0 },
  ]);
});

// ---------------------------------------------------------------------------
// flow control (contract 10 — the same survey increment B): ack-based
// watermarks, out-of-band (never node-pty's in-band experimental
// handleFlowControl). Every routed chunk counts toward the session's
// UNACKNOWLEDGED chars; past the high watermark the manager pauses the pty
// handle (backpressure at the source — xterm's write buffer is otherwise
// unbounded until its 50 MB OOM guard). ack() reports chars the renderer has
// actually consumed (parse-complete); below the low watermark the pty
// resumes. VS Code's constants: high 100,000 / low 5,000 — injected small
// here to keep the test data readable.
// ---------------------------------------------------------------------------

test("psm-pauses-past-high-watermark-and-resumes-on-ack: unacked chars past the high watermark pause the pty once; acks resume it only below the low watermark; ack fails closed on unknown ids and non-positive counts", () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port, { highWatermarkChars: 10, lowWatermarkChars: 3 });
  const sessionId = manager.create(BASE_OPTS, () => {}, () => {});
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  handle.emitData("aaaa"); // 4 unacked — under the high watermark
  assert.equal(handle.pauseCount, 0);

  handle.emitData("bbbbbbbb"); // 12 unacked — past the high watermark
  assert.equal(handle.pauseCount, 1);

  handle.emitData("cc"); // 14 unacked — already paused, never re-paused
  assert.equal(handle.pauseCount, 1);

  // Acks decrement, but the pty resumes only once unacked drops BELOW the low watermark.
  assert.equal(manager.ack(sessionId, 4), true); // 10 left — still ≥ low
  assert.equal(handle.resumeCount, 0);
  assert.equal(manager.ack(sessionId, 8), true); // 2 left — below low, resume
  assert.equal(handle.resumeCount, 1);

  // Resumed accounting continues from the real remainder — 2 + 2 = 4 stays under the high
  // watermark, so no fresh pause.
  handle.emitData("dd");
  assert.equal(handle.pauseCount, 1);

  // Fail-closed: an unknown session id and non-positive/non-finite counts are typed no-ops.
  assert.doesNotThrow(() => {
    assert.equal(manager.ack("no-such-session", 5), false);
    assert.equal(manager.ack(sessionId, 0), false);
    assert.equal(manager.ack(sessionId, -5), false);
    assert.equal(manager.ack(sessionId, Number.NaN), false);
  });
});

test("psm-snapshot-resets-unacknowledged-chars: snapshot() — the re-attach entry point — clears the unacked count and resumes a paused pty, so a dropped renderer can never wedge the session", async () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port, { highWatermarkChars: 10, lowWatermarkChars: 3 });
  const sessionId = manager.create(BASE_OPTS, () => {}, () => {});
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  handle.emitData("aaaaaaaaaaaa"); // 12 unacked — paused, and the acking renderer then DROPS
  assert.equal(handle.pauseCount, 1);
  assert.equal(handle.resumeCount, 0);

  // A fresh renderer re-attaches (bridge.snapshot): the unacked count resets and the pty resumes
  // — VS Code's clearUnacknowledgedChars discipline.
  const snap = await manager.snapshot(sessionId);
  assert.ok(snap !== null);
  assert.equal(handle.resumeCount, 1);

  // The count genuinely reset: 8 fresh chars stay under the high watermark (no re-pause)...
  handle.emitData("eeeeeeee");
  assert.equal(handle.pauseCount, 1);
  // ...and crossing it again from the reset baseline pauses anew.
  handle.emitData("ffff"); // 12 unacked again
  assert.equal(handle.pauseCount, 2);
});
