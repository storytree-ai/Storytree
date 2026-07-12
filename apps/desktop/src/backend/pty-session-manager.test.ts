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

// ---------------------------------------------------------------------------
// spawn + routing
// ---------------------------------------------------------------------------

test("create: spawns via the port with the given options and wires onData to the sink", () => {
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

  assert.deepEqual(received, [{ sessionId, chunk: "hello from the shell\n" }]);
});

test("write: forwards typed input to the addressed session's pty handle", () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const sessionId = manager.create(BASE_OPTS, () => {}, () => {});
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  const ok = manager.write(sessionId, "ls -la\n");

  assert.equal(ok, true);
  assert.deepEqual(handle.writes, ["ls -la\n"]);
});

test("resize: forwards cols/rows to the addressed session's pty handle", () => {
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

test("dispose: kills the pty, frees the session id, and reports it gone", () => {
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

test("the pty's own exit tears the session down and routes the typed onExit event once", () => {
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

test("a late onData after dispose is dropped, not routed to the freed sink", () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);
  const received: string[] = [];
  const sessionId = manager.create(BASE_OPTS, (_sid, chunk) => received.push(chunk), () => {});
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  manager.dispose(sessionId);
  // A race: the underlying process still flushes a buffered chunk after kill().
  handle.emitData("buffered output after kill\n");

  assert.deepEqual(received, []);
});

// ---------------------------------------------------------------------------
// fail-closed on unknown / disposed ids
// ---------------------------------------------------------------------------

test("write/resize/dispose on an unknown session id fail closed — false, never a throw", () => {
  const port = new FakePtyPort();
  const manager = new PtySessionManager(port);

  assert.equal(manager.has("no-such-session"), false);
  assert.doesNotThrow(() => {
    assert.equal(manager.write("no-such-session", "data\n"), false);
    assert.equal(manager.resize("no-such-session", 80, 24), false);
    assert.equal(manager.dispose("no-such-session"), false);
  });
});

test("write/resize on an already-disposed session id fail closed — false, never a throw", () => {
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

test("concurrent sessions are isolated: routing and disposal never cross session boundaries", () => {
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
// scrollback ring + snapshot (contract 6 — ADR-0189 app-owned sessions: the
// manager, not the renderer, holds each live session's recent output so a
// re-attaching dock can replay it into a fresh xterm).
// ---------------------------------------------------------------------------

test("snapshot: buffers routed output in a byte-capped ring, trims the oldest chunks first, and fails closed to null for an unknown or disposed session", () => {
  const port = new FakePtyPort();
  // A tiny cap makes the trim deterministic and observable in a few chunks.
  const manager = new PtySessionManager(port, { scrollbackBytes: 5 });
  const sessionId = manager.create(BASE_OPTS, () => {}, () => {});
  const handle = port.spawned[0]?.handle;
  assert.ok(handle);

  handle.emitData("AAAAA"); // 5 bytes — exactly fills the cap.
  handle.emitData("BB"); // total would be 7 > 5 — the oldest chunk ("AAAAA") is trimmed.
  handle.emitData("CCC"); // total is back to exactly 5 — no trim needed.

  // Only the surviving, most-recent chunks are in the buffer — the oldest chunk is gone.
  assert.equal(manager.snapshot(sessionId), "BBCCC");

  // Fail-closed: an unknown session id yields null, never a throw.
  assert.equal(manager.snapshot("no-such-session"), null);

  // The buffer is freed with the session on dispose.
  manager.dispose(sessionId);
  assert.equal(manager.snapshot(sessionId), null);
});
