/**
 * Contract tests for cloud-sql-admin.ts — pure offline tests over injected I/O.
 * All collaborators are stubbed; no real GCP, no gcloud, no metadata server.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  SQLADMIN_BASE,
  instanceUrl,
  parseInstanceStatus,
  createCloudSqlAdmin,
} from "./cloud-sql-admin.js";
import type {
  ActivationPolicy,
  InstanceStatus,
  HttpResponse,
  CloudSqlAdminDeps,
  CloudSqlAdmin,
} from "./cloud-sql-admin.js";

// ---- SQLADMIN_BASE constant ----------------------------------------------------------------

test("SQLADMIN_BASE is the Cloud SQL Admin v1 base URL", () => {
  assert.equal(SQLADMIN_BASE, "https://sqladmin.googleapis.com/v1");
});

// ---- instanceUrl ---------------------------------------------------------------------------

test("instanceUrl builds the default base URL path", () => {
  const url = instanceUrl("my-project", "my-instance");
  assert.equal(
    url,
    "https://sqladmin.googleapis.com/v1/projects/my-project/instances/my-instance",
  );
});

test("instanceUrl uses a custom baseUrl when supplied", () => {
  const url = instanceUrl("proj", "inst", "https://custom.example.com/v1");
  assert.equal(url, "https://custom.example.com/v1/projects/proj/instances/inst");
});

// ---- parseInstanceStatus -------------------------------------------------------------------

test("parseInstanceStatus parses a valid Cloud SQL instance body", () => {
  const body = {
    state: "RUNNABLE",
    settings: { activationPolicy: "ALWAYS" },
  };
  const result: InstanceStatus = parseInstanceStatus(body);
  assert.equal(result.state, "RUNNABLE");
  assert.equal(result.activationPolicy, "ALWAYS");
});

test("parseInstanceStatus accepts STOPPED state with NEVER policy", () => {
  const body = {
    state: "STOPPED",
    settings: { activationPolicy: "NEVER" },
  };
  const result: InstanceStatus = parseInstanceStatus(body);
  assert.equal(result.state, "STOPPED");
  assert.equal(result.activationPolicy, "NEVER");
});

test("parseInstanceStatus throws when the input is not an object", () => {
  assert.throws(() => parseInstanceStatus(null), /Error/);
  assert.throws(() => parseInstanceStatus("string"), /Error/);
  assert.throws(() => parseInstanceStatus(42), /Error/);
});

test("parseInstanceStatus throws when state is missing", () => {
  const body = { settings: { activationPolicy: "ALWAYS" } };
  assert.throws(() => parseInstanceStatus(body), /Error/);
});

test("parseInstanceStatus throws when settings is missing", () => {
  const body = { state: "RUNNABLE" };
  assert.throws(() => parseInstanceStatus(body), /Error/);
});

test("parseInstanceStatus throws when settings.activationPolicy is missing", () => {
  const body = { state: "RUNNABLE", settings: {} };
  assert.throws(() => parseInstanceStatus(body), /Error/);
});

test("parseInstanceStatus throws when settings is not an object", () => {
  const body = { state: "RUNNABLE", settings: "bad" };
  assert.throws(() => parseInstanceStatus(body), /Error/);
});

// ---- createCloudSqlAdmin — helpers ---------------------------------------------------------

function makeDeps(overrides: Partial<CloudSqlAdminDeps> = {}): CloudSqlAdminDeps {
  return {
    fetchToken: async () => "test-token",
    request: async (_method, _url, _token, _body) => ({ status: 200, body: "{}" }),
    project: "test-project",
    instance: "test-instance",
    ...overrides,
  };
}

function stubInstanceBody(state: string, activationPolicy: string): string {
  return JSON.stringify({ state, settings: { activationPolicy } });
}

// ---- describe() ----------------------------------------------------------------------------

test("describe() calls GET on the correct URL with the fetched token", async () => {
  const calls: Array<{ method: string; url: string; token: string }> = [];
  const deps = makeDeps({
    fetchToken: async () => "my-token",
    request: async (method, url, token) => {
      calls.push({ method, url, token });
      return {
        status: 200,
        body: stubInstanceBody("RUNNABLE", "ALWAYS"),
      };
    },
  });

  const admin: CloudSqlAdmin = createCloudSqlAdmin(deps);
  await admin.describe();

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "GET");
  assert.equal(
    calls[0]?.url,
    "https://sqladmin.googleapis.com/v1/projects/test-project/instances/test-instance",
  );
  assert.equal(calls[0]?.token, "my-token");
});

test("describe() returns the parsed InstanceStatus on a 2xx response", async () => {
  const deps = makeDeps({
    request: async () => ({
      status: 200,
      body: stubInstanceBody("RUNNABLE", "ALWAYS"),
    }),
  });

  const result = await createCloudSqlAdmin(deps).describe();
  assert.equal(result.state, "RUNNABLE");
  assert.equal(result.activationPolicy, "ALWAYS");
});

test("describe() throws a descriptive error on a non-2xx response", async () => {
  const deps = makeDeps({
    request: async () => ({
      status: 403,
      body: "The caller does not have permission",
    }),
  });

  await assert.rejects(
    () => createCloudSqlAdmin(deps).describe(),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /403/);
      assert.match(err.message, /The caller does not have permission/);
      return true;
    },
  );
});

test("describe() trims the error body to 500 chars on non-2xx", async () => {
  const longBody = "E".repeat(600);
  const deps = makeDeps({
    request: async () => ({ status: 500, body: longBody }),
  });

  await assert.rejects(
    () => createCloudSqlAdmin(deps).describe(),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      // The message must not contain more than the first 500 chars of the body
      assert.match(err.message, /500/);
      // The 600-char body is trimmed — the message shouldn't contain more than 500 E's
      assert.ok(!err.message.includes("E".repeat(501)));
      return true;
    },
  );
});

test("describe() uses a custom baseUrl when supplied in deps", async () => {
  const calls: Array<{ url: string }> = [];
  const deps = makeDeps({
    baseUrl: "https://custom.example.com/v1",
    request: async (_method, url, _token) => {
      calls.push({ url });
      return { status: 200, body: stubInstanceBody("RUNNABLE", "ALWAYS") };
    },
  });

  await createCloudSqlAdmin(deps).describe();
  assert.equal(
    calls[0]?.url,
    "https://custom.example.com/v1/projects/test-project/instances/test-instance",
  );
});

// ---- setActivationPolicy() -----------------------------------------------------------------

test("setActivationPolicy() calls PATCH on the correct URL with the fetched token and body", async () => {
  const calls: Array<{ method: string; url: string; token: string; body?: string }> = [];
  const deps = makeDeps({
    fetchToken: async () => "patch-token",
    request: async (method, url, token, body) => {
      calls.push({ method, url, token, body });
      return { status: 200, body: "{}" };
    },
  });

  await createCloudSqlAdmin(deps).setActivationPolicy("ALWAYS");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "PATCH");
  assert.equal(
    calls[0]?.url,
    "https://sqladmin.googleapis.com/v1/projects/test-project/instances/test-instance",
  );
  assert.equal(calls[0]?.token, "patch-token");
  assert.deepEqual(
    JSON.parse(calls[0]?.body ?? "null"),
    { settings: { activationPolicy: "ALWAYS" } },
  );
});

test("setActivationPolicy() sends activationPolicy=NEVER when requested", async () => {
  const calls: Array<{ body?: string }> = [];
  const deps = makeDeps({
    request: async (_method, _url, _token, body) => {
      calls.push({ body });
      return { status: 200, body: "{}" };
    },
  });

  await createCloudSqlAdmin(deps).setActivationPolicy("NEVER");
  assert.deepEqual(
    JSON.parse(calls[0]?.body ?? "null"),
    { settings: { activationPolicy: "NEVER" } },
  );
});

test("setActivationPolicy() resolves void on a 2xx response", async () => {
  const deps = makeDeps({
    request: async () => ({ status: 200, body: "{}" }),
  });

  const result = await createCloudSqlAdmin(deps).setActivationPolicy("ALWAYS");
  assert.equal(result, undefined);
});

test("setActivationPolicy() throws a descriptive error on a non-2xx response", async () => {
  const deps = makeDeps({
    request: async () => ({
      status: 403,
      body: "forbidden by IAM policy",
    }),
  });

  await assert.rejects(
    () => createCloudSqlAdmin(deps).setActivationPolicy("ALWAYS"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /403/);
      assert.match(err.message, /forbidden by IAM policy/);
      return true;
    },
  );
});

test("setActivationPolicy() trims error body to 500 chars on non-2xx", async () => {
  const longBody = "X".repeat(600);
  const deps = makeDeps({
    request: async () => ({ status: 500, body: longBody }),
  });

  await assert.rejects(
    () => createCloudSqlAdmin(deps).setActivationPolicy("NEVER"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /500/);
      assert.ok(!err.message.includes("X".repeat(501)));
      return true;
    },
  );
});

// ---- type-level: ActivationPolicy is a union of the two literal strings --------------------
// (This test pins that the exported type constrains correctly — if the union changes, it breaks.)

test("ActivationPolicy accepts ALWAYS and NEVER as literal values at runtime", () => {
  const values: ActivationPolicy[] = ["ALWAYS", "NEVER"];
  assert.equal(values.length, 2);
  assert.ok(values.includes("ALWAYS"));
  assert.ok(values.includes("NEVER"));
});
