#!/usr/bin/env -S tsx
import process from "node:process";
import { pathToFileURL } from "node:url";

import { InMemoryStore, type Store } from "@storytree/core";
import {
  loadCorpus,
  createPool,
  closePool,
  PgLibraryStore,
} from "@storytree/store";

import { run } from "./commands.js";
import { formatEnvelope } from "./envelope.js";

/**
 * The `storytree` CLI entry (ADR-0022). Offline-first: by default it runs against an in-memory store
 * seeded from the studio data files (`loadCorpus`), so the read commands work with NO Cloud SQL and
 * NO API key. `--pg` swaps in the live Postgres store (the instance is STOPPED by default — bring it
 * up first). The dispatch lives in `run`; this file only wires the store and prints the envelope.
 */
async function buildStore(usePg: boolean): Promise<{ store: Store; close: () => Promise<void> }> {
  if (usePg) {
    const { pool, connector } = await createPool();
    return { store: new PgLibraryStore(pool), close: () => closePool(pool, connector) };
  }
  const store = new InMemoryStore();
  await loadCorpus(store);
  return { store, close: async () => {} };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { store, close } = await buildStore(argv.includes("--pg"));
  try {
    const env = await run(argv, { store });
    process.stdout.write(formatEnvelope(env));
    process.exitCode = env.ok ? 0 : 1;
  } finally {
    await close();
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
