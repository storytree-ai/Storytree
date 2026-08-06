/**
 * The DESKTOP half of the `GET /api/arcs` cross-surface conformance harness
 * (`pnpm check:mirror-conformance`). A probe, not a route: it prints the `{ status, body }` this
 * backend serves for each request in a fixture, so the gate can diff it against the studio payload
 * it is a hand-written copy of.
 *
 * It runs in ITS OWN process, launched by packages/cli/src/check-mirror-conformance.ts, and imports
 * ONLY this app — the boundary that makes the whole harness legal. This backend deliberately
 * re-composes the studio's route over its own seam and may never import apps/studio/server
 * (ADR-0176; `check:boundaries` enforces the wall), so conformance is established by a third party
 * comparing two JSON payloads, not by either side importing the other.
 *
 * WHAT IS AND IS NOT UNDER TEST HERE. The arc → children JOIN is shared code — `loadArcRollups` in
 * @storytree/drive, which both surfaces call — so the rollup's CONTENT carries no re-composition
 * risk. What is hand-copied is the ENVELOPE: the method guard, the two "no document store" answers,
 * the unknown-id answer, the id decode, the `{ arcs }` key. Most of that is expressed as a STATUS,
 * which is why this probe prints the status alongside the body and drives the real
 * `createLocalBackend` handler (including its own central error mapping) rather than the arcs branch
 * in isolation.
 *
 * The fixture's store is INPUT, not the subject. It is a minimal in-memory store defined HERE
 * because `@storytree/storage-protocol` is drive's declared dep and not desktop's, so pnpm's strict
 * isolation will not resolve `InMemoryStore` from apps/desktop (the same reason
 * chat-sse-mount.test.ts carries its own fixture store). Only `getDoc`/`queryDocs` are exercised and
 * the rollup sorts everything it returns, so it and the studio probe's `InMemoryStore` are
 * interchangeable here by construction.
 *
 * Contract (shared with the studio probe, apps/studio/server/arcsMirrorProbe.ts):
 *   argv: one or more absolute fixture DIRECTORY paths, each holding `arcs.json`
 *         (`{ docs: StoredDoc[] | null, requests: { label, method, path }[] }`) plus, when `docs` is
 *         non-null, a `docs/decisions` tree and a `stories/` tree
 *   stdout: a single JSON object `{ [fixtureDir]: { [label]: { status, body } } }`
 *   exit: 0 on success; non-zero (with the error on stderr) on any failure — the gate treats a
 *         failed probe as a FAILED conformance check, never as a skip.
 *
 * The answers are printed VERBATIM: the third party owns the projection into comparable entries
 * (`projectArcsPayload` in packages/cli/src/mirror-conformance.ts), so the two probes cannot drift
 * in how they reshape what they measured.
 */

import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

import { createLocalBackend } from "./local-backend.js";
import type { LocalBackendBackend } from "./local-backend.js";

/** The shared fixture shape — the doc set (null = no document store) plus the requests to replay. */
interface ArcFixture {
  docs: { id: string; kind: string; doc: unknown }[] | null;
  requests: { label: string; method: string; path: string }[];
}

/** A minimal document store over the fixture's rows — see the header for why it is not imported. */
class FixtureStore {
  readonly #docs = new Map<
    string,
    { id: string; kind: string; doc: unknown; createdAt: string; updatedAt: string }
  >();
  #seq = 0;

  async upsertDoc(input: { id: string; kind: string; doc: unknown; actor?: string }) {
    const now = new Date().toISOString();
    const entry = {
      id: input.id,
      kind: input.kind,
      doc: input.doc,
      createdAt: this.#docs.get(input.id)?.createdAt ?? now,
      updatedAt: now,
    };
    this.#docs.set(input.id, entry);
    return entry;
  }
  async getDoc(id: string) {
    return this.#docs.get(id) ?? null;
  }
  async queryDocs(filter?: { kind?: string }) {
    const all = [...this.#docs.values()];
    return filter?.kind === undefined ? all : all.filter((d) => d.kind === filter.kind);
  }
  async deleteDoc(id: string) {
    return this.#docs.delete(id);
  }
  async appendEvent(e: {
    id: string;
    kind: string;
    type: "created" | "updated" | "deleted";
    doc: unknown;
    actor?: string;
  }) {
    return { seq: ++this.#seq, ...e, actor: e.actor ?? "system", at: new Date().toISOString() };
  }
  async readEvents() {
    return [];
  }
}

/**
 * The reads `/api/arcs` must NEVER reach. Wired to throw rather than to a benign value: the gate's
 * discipline is fail-CLOSED, so a route that started pulling the tree or the asset list on this path
 * should break the probe loudly instead of quietly widening what the comparison covers.
 */
function offPath(name: string): () => never {
  return () => {
    throw new Error(`arcs-mirror-probe: GET /api/arcs must not call ${name}`);
  };
}

/** Capture the status + JSON body a handler sends, without a socket. */
async function capture(
  run: (res: ServerResponse) => Promise<void>,
): Promise<{ status: number; body: unknown }> {
  let body = "";
  const sink = {
    statusCode: 0,
    setHeader(): void {},
    end(chunk?: string): void {
      body = chunk ?? "";
    },
  };
  await run(sink as unknown as ServerResponse);
  return { status: sink.statusCode, body: body === "" ? null : JSON.parse(body) };
}

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error("arcs-mirror-probe: expected one or more fixture directory paths as arguments");
  process.exit(2);
}

const out: Record<string, unknown> = {};
for (const dir of dirs) {
  const fixture = JSON.parse(readFileSync(path.join(dir, "arcs.json"), "utf8")) as ArcFixture;

  let store: FixtureStore | null = null;
  if (fixture.docs !== null) {
    store = new FixtureStore();
    for (const d of fixture.docs) await store.upsertDoc({ id: d.id, kind: d.kind, doc: d.doc });
  }

  const backend: LocalBackendBackend = {
    docStore: async () => store,
    listAssets: offPath("listAssets"),
    latestVerdicts: offPath("latestVerdicts"),
    inFlightBuilds: offPath("inFlightBuilds"),
    health: offPath("health"),
  };
  const handler = createLocalBackend({
    storiesDir: path.join(dir, "stories"),
    docsDir: path.join(dir, "docs"),
    store: "probe",
    backend,
  });

  const answers: Record<string, unknown> = {};
  for (const request of fixture.requests) {
    const req = { method: request.method, url: request.path } as IncomingMessage;
    answers[request.label] = await capture((res) => handler(req, res));
  }
  out[dir] = answers;
}
process.stdout.write(JSON.stringify(out));
