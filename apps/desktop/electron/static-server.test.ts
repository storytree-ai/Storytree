import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { SIDECAR_TOKEN_HEADER } from "../src/backend/loopback-guard.js";
import { serveStudio, type BackendTarget } from "./static-server.js";

async function backend(name: string): Promise<{ port: number; server: Server }> {
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ name, token: req.headers[SIDECAR_TOKEN_HEADER] ?? null }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { port: (server.address() as AddressInfo).port, server };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err === undefined ? resolve() : reject(err))),
  );
}

test("the studio proxy retargets to a replacement sidecar and reports the stopped interval", async () => {
  const dist = await mkdtemp(join(tmpdir(), "storytree-static-server-"));
  const first = await backend("first");
  const second = await backend("second");
  let target: BackendTarget | null = { port: first.port, sidecarToken: "first-token" };
  await writeFile(join(dist, "index.html"), "<!doctype html><title>storytree</title>");
  const studio = await serveStudio(dist, { backend: () => target });

  try {
    const initial = (await (await fetch(`${studio.url}api/health`)).json()) as Record<string, unknown>;
    assert.deepEqual(initial, { name: "first", token: "first-token" });

    target = null;
    const stopped = await fetch(`${studio.url}api/health`);
    assert.equal(stopped.status, 503);
    assert.deepEqual(await stopped.json(), { error: "no local backend (sidecar not started)" });

    target = { port: second.port, sidecarToken: "second-token" };
    const retried = (await (await fetch(`${studio.url}api/health`)).json()) as Record<string, unknown>;
    assert.deepEqual(retried, { name: "second", token: "second-token" });
  } finally {
    await Promise.all([close(studio.server), close(first.server), close(second.server)]);
    await rm(dist, { recursive: true, force: true });
  }
});
