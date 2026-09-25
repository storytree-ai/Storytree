/**
 * Capability 1 · Project libraries: one test per contract in stories/library.md.
 *
 * These run against the real Postgres that `pnpm test` provides. Every project a test makes is
 * named with uniqueProjectName() and its databases are dropped at the end, pass or fail, so tests
 * can share one server, and run beside other test files, without seeing each other's projects.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { dropTestDatabases, testServerUrl, uniqueProjectName, withTestClient } from "../testing/pg.js";
import { connect, type Project, type Storytree } from "./index.js";

/** The spec's naming, restated here rather than taken from the code: project `x` is database `storytree_x`. */
function databaseOf(project: string): string {
  return `storytree_${project}`;
}

/**
 * Run `body` with a fresh connection to the test server. Afterwards close it and drop
 * `databases`, whether the body passed or failed.
 */
async function withStorytree(
  databases: readonly string[],
  body: (storytree: Storytree) => Promise<void>,
): Promise<void> {
  let storytree: Storytree | undefined;
  try {
    storytree = await connect({ url: testServerUrl() });
    await body(storytree);
  } finally {
    try {
      await storytree?.close();
    } finally {
      await dropTestDatabases(databases);
    }
  }
}

/** The databases on the test server whose names contain `token`, in byte order. */
async function databasesContaining(token: string): Promise<string[]> {
  return withTestClient(async (client) => {
    const { rows } = await client.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE strpos(datname, $1) > 0 ORDER BY datname COLLATE "C"`,
      [token],
    );
    return rows.map((row) => row.datname);
  });
}

/** A project database's library_meta rows as { key: value }, read over an independent connection. */
async function metaOf(database: string): Promise<Record<string, string>> {
  return withTestClient(async (client) => {
    const { rows } = await client.query<{ key: string; value: string }>("SELECT key, value FROM library_meta");
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  }, database);
}

/** The database a project's pool is actually connected to. */
async function connectedDatabase(project: Project): Promise<string | undefined> {
  const { rows } = await project.pool.query<{ db: string }>("SELECT current_database() AS db");
  return rows[0]?.db;
}

test("1.1 openProject creates the project's database and its tables", async () => {
  const name = uniqueProjectName();
  await withStorytree([databaseOf(name)], async (storytree) => {
    assert.deepEqual(await databasesContaining(name), [], "precondition: the project has no database yet");

    const project = await storytree.openProject(name);

    assert.equal(project.name, name);
    assert.deepEqual(await databasesContaining(name), [databaseOf(name)], "its database is storytree_<name>");
    // Its tables exist, seen from outside the library: library_meta, holding the project's name.
    assert.deepEqual(await metaOf(databaseOf(name)), { project: name });
  });
});

test("1.2 opening the same project again succeeds and changes nothing", async () => {
  const name = uniqueProjectName();
  const raced = uniqueProjectName();
  await withStorytree([databaseOf(name), databaseOf(raced)], async (storytree) => {
    const first = await storytree.openProject(name);
    await first.pool.query("INSERT INTO library_meta (key, value) VALUES ('probe', 'saved before reopening')");
    const before = await metaOf(databaseOf(name));
    assert.deepEqual(before, { project: name, probe: "saved before reopening" });

    // Open it again from a second connection, as a new process would.
    const later = await connect({ url: testServerUrl() });
    try {
      const again = await later.openProject(name);

      assert.equal(again.name, name);
      assert.deepEqual(await databasesContaining(name), [databaseOf(name)], "no second database");
      assert.deepEqual(await metaOf(databaseOf(name)), before, "its records are untouched");

      // Two first opens of one project racing each other are just as safe: both succeed and
      // there is one database, set up once.
      const both = await Promise.all([storytree.openProject(raced), later.openProject(raced)]);
      assert.deepEqual(both.map((project) => project.name), [raced, raced]);
      assert.deepEqual(await databasesContaining(raced), [databaseOf(raced)]);
      assert.deepEqual(await metaOf(databaseOf(raced)), { project: raced });
    } finally {
      await later.close();
    }
  });
});

test("1.3 listProjects returns exactly the storytree projects, sorted, and no other database", async () => {
  const run = uniqueProjectName();
  const site = `${run}-site`;
  const app = `${run}-app`;
  // Databases on the same server that are NOT storytree projects, including near misses that a
  // loose match would take: '_' is a LIKE wildcard, ILIKE ignores case, and the prefix must lead.
  const others = [run, `storytree-${run}`, `Storytree_${run}`, `xstorytree_${run}`];
  await withStorytree([databaseOf(site), databaseOf(app), ...others], async (storytree) => {
    await withTestClient(async (client) => {
      for (const database of others) await client.query(`CREATE DATABASE "${database}"`);
    });
    await storytree.openProject(site); // opened first, listed second: the order is the sort's
    await storytree.openProject(app);

    const listed = await storytree.listProjects();

    // The server is shared with other tests, so "exactly" is judged on the names this test made:
    // whatever is listed that carries this run's token must be precisely app and site.
    const token = run.slice("t-".length);
    assert.deepEqual(listed.filter((project) => project.includes(token)), [app, site]);
    assert.deepEqual(listed, [...listed].sort(), "the list is sorted");
  });
});

test("1.4 a record saved in one project cannot be read from another", async () => {
  const run = uniqueProjectName();
  const site = `${run}-site`;
  const app = `${run}-app`;
  await withStorytree([databaseOf(site), databaseOf(app)], async (storytree) => {
    const siteLibrary = await storytree.openProject(site);
    const appLibrary = await storytree.openProject(app);
    const probe = "SELECT value FROM library_meta WHERE key = 'isolation-probe'";

    await siteLibrary.pool.query("INSERT INTO library_meta (key, value) VALUES ('isolation-probe', 'saved in site')");

    const values = async (project: Project) => (await project.pool.query<{ value: string }>(probe)).rows.map((row) => row.value);
    assert.deepEqual(await values(siteLibrary), ["saved in site"], "site reads its own record");
    assert.deepEqual(await values(appLibrary), [], "app cannot read site's record");
    assert.deepEqual(await metaOf(databaseOf(app)), { project: app }, "app's database holds only its own records");
    // Each library is its own database, not a view onto a shared one.
    assert.equal(await connectedDatabase(siteLibrary), databaseOf(site));
    assert.equal(await connectedDatabase(appLibrary), databaseOf(app));
  });
});

test("1.5 a bad project name is refused before anything touches the server, and the error names the rule", async () => {
  // Nothing listens on port 1: a name check that ran after reaching for the server would fail
  // with a connection error instead of naming the rule.
  const offline = await connect({ url: "postgres://postgres@127.0.0.1:1/postgres" });
  try {
    const refused = [
      "",
      "Site",
      "my_site",
      "my site",
      "-site",
      "site-",
      "my--site",
      "x".repeat(41),
      "sité",
      "site\n",
      "../site",
      undefined as unknown as string,
    ];
    for (const name of refused) {
      await assert.rejects(
        offline.openProject(name),
        (error: unknown) => {
          assert.ok(error instanceof Error, `the refusal of ${JSON.stringify(name)} is an Error`);
          assert.match(error.message, /lower-case letters, digits and single hyphens/, `for ${JSON.stringify(name)}`);
          assert.match(error.message, /1.40 characters/, `for ${JSON.stringify(name)}`);
          assert.match(error.message, /start(s|ing) with a letter or digit/, `for ${JSON.stringify(name)}`);
          return true;
        },
        `${JSON.stringify(name)} should be refused`,
      );
    }
    // Control: a good name passes the rule (one character is enough) and does reach for the
    // server, which proves the server above really was out of reach.
    await assert.rejects(offline.openProject("a"), { code: "ECONNREFUSED" });
  } finally {
    await offline.close();
  }

  // The rule's far edges open for real: forty characters, and a leading digit.
  const run = uniqueProjectName();
  const longest = `${run}-${"x".repeat(29)}`;
  const digitFirst = `9-${run}`;
  assert.equal(longest.length, 40);
  await withStorytree([databaseOf(longest), databaseOf(digitFirst)], async (storytree) => {
    for (const name of [longest, digitFirst]) {
      assert.equal((await storytree.openProject(name)).name, name);
    }
    assert.deepEqual(await databasesContaining(run), [databaseOf(digitFirst), databaseOf(longest)]);
  });
});
