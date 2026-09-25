/**
 * Capability 8 · Cloud connection (GCP), contract 8.2 in stories/library.md: a missing or bad
 * Google sign-in, and every other way reaching a Cloud SQL instance can fail, is refused with a
 * message saying what to fix, never a hang. (8.1, the live proof, is in
 * src/transactions/cloud-sql.test.ts.)
 *
 * Nothing here reaches Google or a real Cloud SQL instance. The cloud path is handed a fake
 * connector through connect()'s seam: one that fails the way Google's does (no sign-in found, a
 * sign-in expired or revoked, an instance that is missing or not allowed, no answer at all), or one
 * that signs in as nobody and hands back a plain socket to the local test Postgres, which then
 * answers as the Cloud SQL server would for the user connect() was given (an account that is not a
 * database user, a user that may not create databases). The same refusal of CREATE DATABASE on the
 * local path is proved on the local server itself. The messages are restated here from the brief,
 * not taken from the code. Every role and database a test makes is named with uniqueProjectName()
 * and dropped at the end, pass or fail.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer, connect as openSocket, type AddressInfo, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { mock, test } from "node:test";

import {
  createTestRole,
  dropTestDatabases,
  dropTestRoles,
  testServerUrl,
  uniqueProjectName,
  withTestClient,
} from "../testing/pg.js";
import { PgTransactions } from "../transactions/pg.js";
import {
  ConnectionError,
  connect,
  type CloudSqlConnector,
  type ConnectionProblem,
  type Project,
  type Storytree,
} from "./index.js";

/** A connection name in the right form that names no real instance. The fake connectors never look it up. */
const INSTANCE = "storytree-offline:nowhere1:no-such-instance";
/** A Google account, for the tests that never reach a database. */
const USER = "you@example.com";
/** google-auth-library's own words when it finds no Application Default Credentials anywhere. */
const NO_SIGN_IN =
  "Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.";

test("8.2 a cloudSql setting that is not an instance's connection name and a Google account email is refused before any network call, saying what to fix", async () => {
  const google = fakeGoogle(() => assert.fail("a refused setting reaches no connector"));
  const settings = (instance: unknown, user: unknown): unknown => ({ cloudSql: { instance, user } });
  const badInstance = (instance: unknown) =>
    `The Cloud SQL instance ${String(JSON.stringify(instance))} is not written as project:region:instance. ` +
    "Copy its connection name from the instance's page in the Cloud Console (for example my-project:australia-southeast1:my-instance).";
  const badUser = (user: unknown) =>
    `The Cloud SQL user ${String(JSON.stringify(user))} is not a Google account email. ` +
    "Give the email of the Google account you sign in with (for example you@example.com).";
  const notSettings =
    "The Cloud SQL settings are { instance, user }: the instance's connection name (project:region:instance) " +
    "and the email of the Google account to sign in as.";

  const refused: [options: unknown, message: string][] = [
    // The instance, written any way but project:region:instance.
    ...[
      "",
      "storytree-pg", // the instance's name alone
      "my-project:storytree-pg", // no region
      "my-project::storytree-pg", // an empty region
      "my-project/australia-southeast1/storytree-pg",
      "projects/my-project/instances/storytree-pg", // the Admin API's path
      "my-project:australia-southeast1:storytree-pg:extra",
      " my-project:australia-southeast1:storytree-pg",
      "my-project:australia-southeast1:storytree-pg\n",
      "My-Project:australia-southeast1:storytree-pg", // project ids are lower-case
      undefined,
      42,
    ].map((instance): [unknown, string] => [settings(instance, USER), badInstance(instance)]),
    // The user, anything but an email address.
    ...[
      "",
      "you",
      "you@",
      "@example.com",
      "you @example.com",
      "you@example.com\n",
      "you\u0000@example.com",
      "you@home@example.com",
      undefined,
      7,
    ].map((user): [unknown, string] => [settings(INSTANCE, user), badUser(user)]),
    // Settings that are not an instance and a user at all, or a url given as well.
    [{ cloudSql: null }, notSettings],
    [{ cloudSql: INSTANCE }, notSettings],
    [{ cloudSql: [INSTANCE, USER] }, notSettings],
    [
      { cloudSql: { instance: INSTANCE, user: USER }, url: "postgres://postgres@127.0.0.1:5432/postgres" },
      "Give connect() either a url or a cloudSql instance, not both.",
    ],
  ];
  for (const [options, message] of refused) {
    await assert.rejects(
      connect(untyped(options), { connector: google.make }),
      (error: unknown) => {
        assert.equal(refusal(error, "config").message, message);
        return true;
      },
      JSON.stringify(options),
    );
  }
  assert.equal(google.made, 0, "no connector was made, so nothing reached the network");
  assert.deepEqual(googleCodeLoaded(), [], "no Google code was even loaded");

  // Control: settings in the right form are accepted, and reach the connector, which signs in by
  // IAM (no password) over the instance's public IP. A project in a domain keeps its domain, and a
  // service account's database user is its email without .gserviceaccount.com. Nothing is opened
  // on the server until a call needs it, and close() closes the connector too, once.
  for (const [instance, user] of [
    ["my-project:australia-southeast1:my-instance", USER],
    ["example.com:my-project:us-central1:db-1", "storytree-ci@my-project.iam"],
  ] as const) {
    const accepted = fakeGoogle(toTestServer);
    const storytree = await connect({ cloudSql: { instance, user } }, { connector: accepted.make });
    assert.equal(accepted.made, 1);
    assert.deepEqual(accepted.calls, [{ instanceConnectionName: instance, authType: "IAM", ipType: "PUBLIC" }]);
    assert.equal(accepted.closed, 0);
    await storytree.close();
    await storytree.close();
    assert.equal(accepted.closed, 1, "close() closes the connector, once");
  }
});

test("8.2 no Google sign-in found is refused with the command that signs in, never a hang", async () => {
  const noSignIn = new Error(NO_SIGN_IN);
  const google = fakeGoogle(async () => {
    throw noSignIn;
  });

  const refused = await refusalOf(connect({ cloudSql: { instance: INSTANCE, user: USER } }, { connector: google.make }), "sign-in");

  assert.equal(
    refused.message,
    "Storytree could not find your Google sign-in. Run `gcloud auth application-default login`, then try again.",
  );
  assert.equal(refused.cause, noSignIn, "the failure it explains is kept as its cause");
  assert.equal(google.calls.length, 1, "it was the sign-in that failed");
  assertNotClosed(google);
});

test("8.2 an expired or revoked Google sign-in is refused with the command that signs in again", async () => {
  const bad = [
    // The refresh token behind Application Default Credentials has expired or been revoked.
    googleHttpError(400, "invalid_grant", { error: "invalid_grant", error_description: "Token has been expired or revoked." }),
    // The organisation wants the account to sign in again (google-auth-library puts the whole reply in the message).
    googleHttpError(
      400,
      JSON.stringify({ error: "invalid_grant", error_description: "reauth related error (invalid_rapt)", error_subtype: "invalid_rapt" }),
      { error: "invalid_grant", error_description: "reauth related error (invalid_rapt)", error_subtype: "invalid_rapt" },
    ),
    // Google turned down the credentials themselves.
    googleHttpError(401, "Request had invalid authentication credentials.", {
      error: { code: 401, message: "Request had invalid authentication credentials.", status: "UNAUTHENTICATED" },
    }),
  ];
  for (const failure of bad) {
    const google = fakeGoogle(async () => {
      throw failure;
    });
    const refused = await refusalOf(connect({ cloudSql: { instance: INSTANCE, user: USER } }, { connector: google.make }), "sign-in");
    assert.equal(
      refused.message,
      "Your Google sign-in was not accepted: it has expired or been revoked. Run `gcloud auth application-default login`, then try again.",
      failure.message,
    );
    assert.equal(refused.cause, failure);
    assertNotClosed(google);
  }
});

test("8.2 an instance that does not exist, or that the account may not use, is refused naming the instance and the Cloud SQL Client role", async () => {
  const bad = [
    googleHttpError(404, "The Cloud SQL instance does not exist.", {
      error: { code: 404, message: "The Cloud SQL instance does not exist.", errors: [{ reason: "instanceDoesNotExist" }] },
    }),
    googleHttpError(403, "The client is not authorized to make this request.", {
      error: { code: 403, message: "The client is not authorized to make this request.", errors: [{ reason: "notAuthorized" }] },
    }),
  ];
  for (const failure of bad) {
    const google = fakeGoogle(async () => {
      throw failure;
    });
    const refused = await refusalOf(connect({ cloudSql: { instance: INSTANCE, user: USER } }, { connector: google.make }), "instance");
    assert.equal(
      refused.message,
      `Storytree could not open the Cloud SQL instance "${INSTANCE}" as ${USER}: it does not exist, or the account ` +
        `is not allowed to use it. Check the instance's name, and that ${USER} has the Cloud SQL Client role on it. ` +
        `(Google said: ${failure.message})`,
    );
    assert.equal(refused.cause, failure);
    assertNotClosed(google);
  }
});

test("8.2 a Google account that is not a database user on the instance is refused, saying to add it as a Cloud SQL IAM user", async () => {
  const run = uniqueProjectName();
  // No role of this name on the server: an account never added to the instance as a database user.
  const user = `${run}@storytree.test`;
  let storytree: Storytree | undefined;
  try {
    storytree = await connect({ cloudSql: { instance: INSTANCE, user } }, { connector: fakeGoogle(toTestServer).make });
    const opened = storytree;
    for (const [call, attempt] of [
      ["listProjects", () => opened.listProjects()],
      ["openProject", () => opened.openProject(run)],
    ] as const) {
      const refused = await refusalOf(attempt(), "database-user");
      assert.equal(
        refused.message,
        `Cloud SQL did not let ${user} in as a database user on "${INSTANCE}". Add the account to the instance as a ` +
          `Cloud SQL IAM user (gcloud sql users create ${user} --instance=no-such-instance --project=storytree-offline ` +
          "--type=cloud_iam_user) with the Cloud SQL Instance User role, and check it is the account you signed in with.",
        call,
      );
      assert.equal(codeOf(refused.cause), "28000", `${call}: the server's own refusal is its cause`);
    }
    assert.deepEqual(await databasesContaining(run), [], "nothing was made on the server");

    // Control: once the account is a database user (a role of its name, which adding it to the
    // instance makes), the same connection lets it in.
    await createTestRole(user, { createdb: false });
    assert.ok(Array.isArray(await opened.listProjects()));
  } finally {
    await storytree?.close();
    await dropTestDatabases([`storytree_${run}`]);
    await dropTestRoles([user]);
  }
});

test("8.2 opening a new project on Cloud SQL as a user that may not create databases is refused with the grant that fixes it", async () => {
  const run = uniqueProjectName();
  // A database user without the right to create databases, as a Cloud SQL IAM user is by default.
  const user = `${run}@storytree.test`;
  const site = `${run}-site`;
  const app = `${run}-app`;
  let storytree: Storytree | undefined;
  try {
    await createTestRole(user, { createdb: false });
    storytree = await connect({ cloudSql: { instance: INSTANCE, user } }, { connector: fakeGoogle(toTestServer).make });

    const refused = await refusalOf(storytree.openProject(site), "create-database");
    assert.equal(
      refused.message,
      "Your Cloud SQL user cannot create databases, and storytree keeps one database per project. Grant it once, as the " +
        `instance's \`postgres\` user: \`ALTER ROLE "${user}" CREATEDB;\` — or create the database \`storytree_${site}\` ` +
        `yourself, owned by "${user}".`,
    );
    assert.equal(codeOf(refused.cause), "42501", "the server's own refusal is its cause");
    assert.deepEqual(await databasesContaining(run), [], "no database was made");

    // Both ways out that the message names work. A database made for the user, and owned by it, opens:
    await withTestClient((client) => client.query(`CREATE DATABASE "storytree_${app}" OWNER "${user}"`));
    await assertUsable(await storytree.openProject(app), user);
    // and once the grant is run as the message writes it, the new project's database is made.
    await withTestClient((client) => client.query(grantIn(refused.message)));
    await assertUsable(await storytree.openProject(site), user);
    assert.deepEqual(await databasesContaining(run), [`storytree_${app}`, `storytree_${site}`]);
  } finally {
    await storytree?.close();
    await dropTestDatabases([`storytree_${site}`, `storytree_${app}`]);
    await dropTestRoles([user]);
  }
});

test("8.2 on the local path too, opening a new project as a server user that may not create databases is refused with the grant that fixes it", async () => {
  const run = uniqueProjectName();
  const role = `${run}-user`;
  const reader = `${run}-reader`;
  let storytree: Storytree | undefined;
  let readOnly: Storytree | undefined;
  try {
    await createTestRole(role, { createdb: false });
    const url = new URL(testServerUrl());
    url.username = role;
    storytree = await connect({ url: url.href });

    const refused = await refusalOf(storytree.openProject(run), "create-database");
    assert.equal(
      refused.message,
      "Your Postgres user cannot create databases, and storytree keeps one database per project. Grant it once, as a " +
        `superuser (such as \`postgres\`): \`ALTER ROLE "${role}" CREATEDB;\` — or create the database \`storytree_${run}\` ` +
        `yourself, owned by "${role}".`,
    );
    assert.equal(codeOf(refused.cause), "42501", "the server's own refusal is its cause");
    assert.deepEqual(await databasesContaining(run), [], "no database was made");

    await withTestClient((client) => client.query(grantIn(refused.message)));
    assert.equal((await storytree.openProject(run)).name, run, "once the grant is run as written, the project opens");
    assert.deepEqual(await databasesContaining(run), [`storytree_${run}`]);
    assert.deepEqual(googleCodeLoaded(), [], "and the local path never loaded Google's code");

    // Only that refusal is taken for a missing grant. A user who may create databases, on a server
    // where CREATE DATABASE fails for another reason (a read-only one, as a read replica is), is
    // told the server's own reason: a grant would fix nothing.
    await createTestRole(reader, { createdb: true });
    await withTestClient((client) => client.query(`ALTER ROLE "${reader}" SET default_transaction_read_only = on`));
    url.username = reader;
    readOnly = await connect({ url: url.href });
    await assert.rejects(readOnly.openProject(`${run}-replica`), (error: unknown) => {
      assert.ok(!(error instanceof ConnectionError), `not a ConnectionError: ${String(error)}`);
      assert.equal(codeOf(error), "25006", "Postgres's own read-only refusal");
      return true;
    });
    assert.deepEqual(await databasesContaining(run), [`storytree_${run}`], "no database was made");
  } finally {
    await storytree?.close();
    await readOnly?.close();
    await dropTestDatabases([`storytree_${run}`, `storytree_${run}-replica`]);
    await dropTestRoles([role, reader]);
  }
});

test("8.2 a Cloud SQL instance that does not answer is refused after a bounded wait, never a hang", async () => {
  // A sign-in that never finishes is refused at 20 seconds, the bound when none is given (on a
  // mocked clock, so the test does not wait for it).
  let finishSignIn: ((options: { stream: () => Duplex }) => void) | undefined;
  const google = fakeGoogle(
    () =>
      new Promise((resolve) => {
        finishSignIn = resolve;
      }),
  );
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let outcome: unknown = "waiting";
    const connecting = connect({ cloudSql: { instance: INSTANCE, user: USER } }, { connector: google.make }).then(
      (storytree) => {
        outcome = storytree;
      },
      (error: unknown) => {
        outcome = error;
      },
    );
    await turnsUntil(() => google.calls.length === 1, "connect() asks the connector to sign in");
    mock.timers.tick(19_999);
    await turns(20);
    assert.equal(outcome, "waiting", "still waiting just short of 20 seconds");
    mock.timers.tick(1);
    // Not `await connecting`: were there no bound, that would wait forever. This fails instead.
    await turnsUntil(() => outcome !== "waiting", "connect() is refused once 20 seconds have passed");
    await connecting;
    assert.equal(
      refusal(outcome, "timeout").message,
      `Storytree could not reach the Cloud SQL instance "${INSTANCE}" within 20 seconds. Check that the instance is ` +
        "running and has a public IP address, and that this network can reach Google Cloud, then try again.",
    );
    // A sign-in that finishes after the refusal is not left running: its connector is closed then.
    assert.equal(google.closed, 0);
    finishSignIn?.({ stream: () => assert.fail("no socket is opened after the refusal") });
    await turns(20);
    assert.equal(google.closed, 1, "the late sign-in's connector is closed");
  } finally {
    mock.timers.reset();
  }

  // An instance that takes the connection and then says nothing is refused at the same bound (here
  // a quarter of a second), by every call that needs it, rather than waiting on the socket. (The
  // silent server hangs up after 10 seconds, so that were there no bound the test would fail on
  // the time taken, not hang.)
  const held = new Set<Socket>();
  const silent = createServer((socket) => {
    held.add(socket);
    setTimeout(() => socket.destroy(), 10_000).unref();
  });
  await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
  const { port } = silent.address() as AddressInfo;
  let storytree: Storytree | undefined;
  try {
    storytree = await connect(
      { cloudSql: { instance: INSTANCE, user: USER } },
      { connector: fakeGoogle(async () => ({ stream: () => connectingSocket(port, "127.0.0.1") })).make, timeoutMs: 250 },
    );
    const opened = storytree;
    for (const [call, attempt] of [
      ["listProjects", () => opened.listProjects()],
      ["openProject", () => opened.openProject(uniqueProjectName())],
    ] as const) {
      const started = performance.now();
      const refused = await refusalOf(attempt(), "timeout");
      const waited = performance.now() - started;
      assert.equal(
        refused.message,
        `Storytree could not reach the Cloud SQL instance "${INSTANCE}" within 0.25 seconds. Check that the instance is ` +
          "running and has a public IP address, and that this network can reach Google Cloud, then try again.",
        call,
      );
      assert.ok(waited >= 200 && waited < 5_000, `${call} was refused at the bound, not before it or long after: ${waited.toFixed(0)} ms`);
    }
    assert.ok(held.size >= 2, "each call did reach the silent server");
  } finally {
    await storytree?.close();
    for (const socket of held) socket.destroy();
    await new Promise<void>((resolve) => silent.close(() => resolve()));
  }
});

/** A fake connector, and what it was asked. */
interface FakeGoogle {
  /** Makes the connector: what connect() is handed as its seam. */
  readonly make: () => Promise<CloudSqlConnector>;
  /** How many connectors were made. */
  made: number;
  /** What getOptions was asked, call by call. */
  readonly calls: unknown[];
  /** How many times a connector was closed. */
  closed: number;
}

/** A connector whose sign-in (getOptions) is `signIn`. It reaches nothing of its own. */
function fakeGoogle(signIn: () => Promise<{ stream: () => Duplex }>): FakeGoogle {
  const google: FakeGoogle = {
    make: async () => {
      google.made += 1;
      return {
        getOptions: (options) => {
          google.calls.push({ ...options });
          return signIn();
        },
        close: () => {
          google.closed += 1;
        },
      };
    },
    made: 0,
    calls: [],
    closed: 0,
  };
  return google;
}

/**
 * A sign-in that succeeds as nobody, with the local test server in place of the instance: every
 * socket the stream opens goes there, and the server answers for the user connect() was given.
 */
async function toTestServer(): Promise<{ stream: () => Duplex }> {
  const server = new URL(testServerUrl());
  return { stream: () => connectingSocket(Number(server.port || 5432), server.hostname) };
}

/**
 * A socket already connecting to `host`:`port`, as the Cloud SQL connector hands pg one. pg calls
 * connect() on the stream it is given; like the connector's socket, this one ignores the call.
 */
function connectingSocket(port: number, host: string): Socket {
  const socket = openSocket(port, host);
  socket.connect = () => socket;
  return socket;
}

/**
 * Assert that a connector whose sign-in failed was not closed. It holds nothing to close, and
 * Google's close() would raise the failed lookup it keeps again, as an unhandled rejection: enough
 * to end a Node process.
 */
function assertNotClosed(google: FakeGoogle): void {
  assert.equal(google.closed, 0, "a connector whose sign-in failed is not closed");
}

/**
 * The Google libraries this process has loaded. The connector's own code is an ES module, but the
 * libraries it loads, google-auth-library and gaxios, are CommonJS and land in require's cache.
 */
function googleCodeLoaded(): string[] {
  return Object.keys(createRequire(import.meta.url).cache).filter((file) =>
    /[\\/]node_modules[\\/](?:google-auth-library|gaxios)[\\/]/.test(file),
  );
}

/** An HTTP failure as Google's client libraries throw one: a gaxios GaxiosError, with its status and the reply. */
function googleHttpError(status: number, message: string, data: unknown): Error {
  return Object.assign(new Error(message), { status, response: { status, data } });
}

/** Assert that `error` is a ConnectionError refusing for `problem`, and return it. */
function refusal(error: unknown, problem: ConnectionProblem): ConnectionError {
  assert.ok(error instanceof ConnectionError, `a ConnectionError, not ${String(error)}`);
  assert.equal(error.problem, problem, error.message);
  return error;
}

/** The ConnectionError `promise` rejects with, refusing for `problem`. */
async function refusalOf(promise: Promise<unknown>, problem: ConnectionProblem): Promise<ConnectionError> {
  try {
    await promise;
  } catch (error) {
    return refusal(error, problem);
  }
  assert.fail(`expected a refusal (${problem}), but the call succeeded`);
}

/** The SQLSTATE of a Postgres error, as pg reports it. */
function codeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
}

/** The ALTER ROLE statement a refusal's message tells the user to run. */
function grantIn(message: string): string {
  const grant = /`(ALTER ROLE [^`]+)`/.exec(message)?.[1];
  return grant ?? assert.fail(`no grant in: ${message}`);
}

/** Assert that a project opened over the cloud path is signed in as `user`, on its own database, and keeps records. */
async function assertUsable(project: Project, user: string): Promise<void> {
  const { rows } = await project.pool.query<{ who: string; db: string }>("SELECT current_user AS who, current_database() AS db");
  assert.deepEqual(rows, [{ who: user, db: `storytree_${project.name}` }]);
  const store = new PgTransactions(project.pool);
  const saved = await store.save({ id: "probe", type: "note", fields: { text: "written over the cloud path" } });
  assert.deepEqual(await store.get("probe"), saved);
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

/** Let the event loop turn `count` times. */
async function turns(count: number): Promise<void> {
  for (let turn = 0; turn < count; turn++) await new Promise((resolve) => setImmediate(resolve));
}

/** Let the event loop turn until `condition` holds, failing the test if it never does. */
async function turnsUntil(condition: () => boolean, what: string): Promise<void> {
  for (let turn = 0; turn < 200; turn++) {
    if (condition()) return;
    await turns(1);
  }
  assert.fail(`this never happened: ${what}`);
}

/** A value the compiler would refuse, sent the way a JavaScript caller could send it. */
function untyped(value: unknown): never {
  return value as never;
}
