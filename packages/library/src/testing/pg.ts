/**
 * Helpers for tests that need a real Postgres.
 *
 * `pnpm test` (scripts/test.mjs) starts a throwaway local server and hands it to the tests as
 * STORYTREE_TEST_PG_URL; set that variable yourself to test against another server. A Postgres
 * test must never skip silently, so asking for the server when there is none throws.
 */
import { randomBytes } from "node:crypto";

import pg from "pg";
import type { Client } from "pg";

/** What uniqueProjectName() puts in every name; the only databases dropTestDatabases() will drop. */
const TEST_TOKEN = /t-[0-9a-f]{8}/;

/** The server the tests run against. Throws when there is none. */
export function testServerUrl(): string {
  const url = process.env.STORYTREE_TEST_PG_URL;
  if (url === undefined || url === "") {
    throw new Error(
      "STORYTREE_TEST_PG_URL is not set: run the tests via `pnpm test`, which starts a local Postgres, " +
        "or set STORYTREE_TEST_PG_URL to a server the tests may create and drop databases on.",
    );
  }
  return url;
}

/** A project name no other test, and no earlier run, is using: `t-` and 8 random hex digits. */
export function uniqueProjectName(): string {
  return `t-${randomBytes(4).toString("hex")}`;
}

/**
 * Run `fn` with a client connected to `database` on the test server (to the server URL's own
 * database when omitted). The connection is independent of the code under test.
 */
export async function withTestClient<T>(
  fn: (client: Client) => Promise<T>,
  database?: string,
): Promise<T> {
  const url = new URL(testServerUrl());
  if (database !== undefined) url.pathname = `/${encodeURIComponent(database)}`;
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Drop a test's databases, ending any connection still open to them. Missing ones are skipped.
 * Only names carrying a uniqueProjectName() token are accepted, so a mistake in a test can never
 * drop somebody's real database on a shared server.
 */
export async function dropTestDatabases(databases: Iterable<string>): Promise<void> {
  const names = [...databases];
  for (const name of names) {
    if (!TEST_TOKEN.test(name)) {
      throw new Error(
        `refusing to drop database ${JSON.stringify(name)}: test databases are named with uniqueProjectName()`,
      );
    }
  }
  if (names.length === 0) return;
  await withTestClient(async (client) => {
    for (const name of names) {
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
    }
  });
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
