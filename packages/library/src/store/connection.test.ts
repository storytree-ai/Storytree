import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { ConnectionOptions, Connector, DriverOptions } from "@google-cloud/cloud-sql-connector";
import type { Pool, PoolConfig } from "pg";
// The PARSER, not the compiler — `typescript@7`'s entry point exports only a version stub and its
// AST surface moved to explicitly unstable subpaths, so this assertion pins TypeScript 5.7's stable
// compiler API as a parsing library under the `typescript5` alias (ADR-0400).
import ts from "typescript5";

import { createPool } from "./connection.js";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const CONNECTION_SOURCE = "packages/library/src/store/connection.ts";
const PRODUCTION_SOURCE_ROOTS = ["apps", "infra", "packages", "scripts"] as const;
const ENV_KEYS = [
  "STORYTREE_ALLOW_DATA_PLANE",
  "STORYTREE_DB_USER",
  "STORYTREE_DB_IMPERSONATE_SERVICE_ACCOUNT",
  "STORYTREE_SECRETS_FILE",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
  "HTTPS_PROXY",
  "UNRELATED_SECRET",
] as const;

type Event =
  | { type: "connector" }
  | { type: "getOptions" }
  | { type: "pool"; config: PoolConfig };

function recordingConstruction(events: Event[]) {
  // `Connector` and `Pool` are external classes a unit test cannot construct — one opens sockets,
  // the other a TLS session. So the doubles declare WHICH members they stand in for:
  // `satisfies Partial<X>` checks every one of them against the real contract, where the old
  // `as unknown as X` chain checked nothing at all and a renamed method would have compiled
  // (anti-slop `no-chained-type-assertions`, inc-09).
  // `Connector` and `Pool` are external classes a unit test cannot construct — one opens sockets,
  // the other a TLS session. So each double declares WHICH members it stands in for and is checked
  // against them: `satisfies Partial<X>` verifies every member's SIGNATURE against the real
  // contract, and the remaining single `as X` is then a legal downcast rather than the
  // `as unknown as X` chain, which checked nothing. Caught immediately: `getOptions` was declared
  // here as `() => Promise<{}>` where the real one is
  // `(opts: ConnectionOptions) => Promise<DriverOptions>` — the chain compiled that for as long as
  // it existed (anti-slop `no-chained-type-assertions`, inc-09).
  const connector = {
    async getOptions(_opts: ConnectionOptions): Promise<DriverOptions> {
      events.push({ type: "getOptions" });
      return {} as DriverOptions;
    },
    close(): void {},
  } satisfies Partial<Connector> as Connector;

  // `createPool` uses exactly two members of the pool — `on("error", …)` and `end()`. `on` comes
  // from the REAL `EventEmitter` `pg.Pool` extends, so the error handler genuinely registers; only
  // `end` is stubbed. One assertion, and it is a legal DOWNCAST from a supertype rather than the
  // `as unknown as Pool` chain, which asserted over nothing.
  const pool = Object.assign(new EventEmitter(), {
    async end(): Promise<void> {},
  }) as Pool;

  return {
    createConnector(): Connector {
      events.push({ type: "connector" });
      return connector;
    },
    createPool(config: PoolConfig): Pool {
      events.push({ type: "pool", config });
      return pool;
    },
  };
}

function saveEnvironment(): () => void {
  const saved = new Map<string, string | undefined>(ENV_KEYS.map((key) => [key, process.env[key]]));
  return () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function resetCredentialEnvironment(secretsFile: string): void {
  process.env["STORYTREE_ALLOW_DATA_PLANE"] = "1";
  process.env["STORYTREE_SECRETS_FILE"] = secretsFile;
  delete process.env["STORYTREE_DB_USER"];
  delete process.env["STORYTREE_DB_IMPERSONATE_SERVICE_ACCOUNT"];
  delete process.env["CLAUDE_CODE_OAUTH_TOKEN"];
  delete process.env["UNRELATED_SECRET"];
}

test("store-dialers-cross-the-hydration-root: createPool resolves the user before dialing", async () => {
  const restoreEnvironment = saveEnvironment();
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "storytree-db-credential-"));
  const validFile = path.join(fixtureDir, "secrets.json");
  const malformedFile = path.join(fixtureDir, "malformed.json");
  const missingFile = path.join(fixtureDir, "missing.json");
  fs.writeFileSync(
    validFile,
    JSON.stringify({
      STORYTREE_DB_USER: "file@example.com",
      CLAUDE_CODE_OAUTH_TOKEN: "must-not-hydrate-here",
      UNRELATED_SECRET: "must-not-hydrate-here",
    }),
  );
  fs.writeFileSync(malformedFile, "not-json {");

  try {
    for (const scenario of [
      {
        name: "CreatePoolOptions.user wins",
        options: { user: "option@example.com" },
        envUser: "environment@example.com",
        expectedUser: "option@example.com",
        expectedEnvUser: "environment@example.com",
      },
      {
        name: "a nonblank environment user wins unchanged",
        options: undefined,
        envUser: "  environment@example.com  ",
        expectedUser: "  environment@example.com  ",
        expectedEnvUser: "  environment@example.com  ",
      },
      {
        name: "an absent environment user hydrates from the file",
        options: undefined,
        envUser: undefined,
        expectedUser: "file@example.com",
        expectedEnvUser: "file@example.com",
      },
      {
        name: "a blank environment user hydrates from the file",
        options: undefined,
        envUser: " \t ",
        expectedUser: "file@example.com",
        expectedEnvUser: "file@example.com",
      },
    ] as const) {
      resetCredentialEnvironment(validFile);
      if (scenario.envUser !== undefined) process.env["STORYTREE_DB_USER"] = scenario.envUser;
      const events: Event[] = [];
      const construction = recordingConstruction(events);

      assert.equal(events.length, 0, `${scenario.name}: construction must remain lazy`);
      await createPool(scenario.options, construction);

      assert.deepEqual(
        events.map((event) => event.type),
        ["connector", "getOptions", "pool"],
        `${scenario.name}: expected connector options before pool construction`,
      );
      const poolEvent = events.find((event): event is Extract<Event, { type: "pool" }> => event.type === "pool");
      assert.equal(poolEvent?.config.user, scenario.expectedUser, scenario.name);
      assert.equal(process.env["STORYTREE_DB_USER"], scenario.expectedEnvUser, scenario.name);
      assert.equal(process.env["CLAUDE_CODE_OAUTH_TOKEN"], undefined, scenario.name);
      assert.equal(process.env["UNRELATED_SECRET"], undefined, scenario.name);
    }

    for (const scenario of [
      { name: "missing secrets file", file: missingFile, envUser: undefined },
      { name: "malformed secrets file", file: malformedFile, envUser: "   " },
    ] as const) {
      resetCredentialEnvironment(scenario.file);
      if (scenario.envUser !== undefined) process.env["STORYTREE_DB_USER"] = scenario.envUser;
      const events: Event[] = [];

      await assert.rejects(
        createPool(undefined, recordingConstruction(events)),
        (error: unknown) => error instanceof Error && error.message.includes("STORYTREE_DB_USER"),
        scenario.name,
      );
      assert.deepEqual(events, [], `${scenario.name}: refusal must precede raw construction`);
    }

    resetCredentialEnvironment(validFile);
    delete process.env["STORYTREE_ALLOW_DATA_PLANE"];
    process.env["STORYTREE_DB_USER"] = "   ";
    process.env["GOOGLE_APPLICATION_CREDENTIALS_JSON"] = "{}";
    process.env["HTTPS_PROXY"] = "http://proxy.invalid";
    const blockedEvents: Event[] = [];
    await assert.rejects(
      createPool(undefined, recordingConstruction(blockedEvents)),
      (error: unknown) => error instanceof Error && error.message.includes("ADR-0250"),
      "the existing data-plane refusal must win before credential hydration",
    );
    assert.equal(process.env["STORYTREE_DB_USER"], "   ");
    assert.deepEqual(blockedEvents, []);
  } finally {
    restoreEnvironment();
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});

const EXCLUDED_SOURCE_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "__fixtures__",
  "build",
  "coverage",
  "dist",
  "fixtures",
  "generated",
  "node_modules",
  "test-fixtures",
  "vendor",
]);

function productionTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_SOURCE_DIRECTORIES.has(entry.name)) {
        files.push(...productionTypeScriptFiles(path.join(directory, entry.name)));
      }
      continue;
    }
    if (!entry.isFile() || !/\.[cm]?tsx?$/.test(entry.name)) continue;
    if (/\.(?:test|spec)\.[cm]?tsx?$/.test(entry.name) || /\.d\.[cm]?ts$/.test(entry.name)) continue;
    files.push(path.join(directory, entry.name));
  }
  return files;
}

function hasRawStoreImport(source: string, filename: string): boolean {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  return sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    if (statement.importClause?.isTypeOnly === true) return false;
    return statement.moduleSpecifier.text === "pg" ||
      statement.moduleSpecifier.text === "@google-cloud/cloud-sql-connector";
  });
}

function rawStoreImportViolations(files: readonly string[]): string[] {
  return files
    .filter((file) => hasRawStoreImport(fs.readFileSync(file, "utf8"), file))
    .map((file) => path.relative(REPO_ROOT, file).replaceAll(path.sep, "/"))
    .filter((file) => file !== CONNECTION_SOURCE)
    .sort();
}

test("store-dialers-cross-the-hydration-root: raw Connector and Pool imports are confined to connection.ts", () => {
  const productionFiles = PRODUCTION_SOURCE_ROOTS.flatMap((root) =>
    productionTypeScriptFiles(path.join(REPO_ROOT, root)),
  );
  const violations = rawStoreImportViolations(productionFiles);
  assert.deepEqual(violations, []);

  const violatingFixture = 'import { Pool } from "pg";\nexport const bypass = new Pool();\n';
  assert.equal(
    hasRawStoreImport(violatingFixture, "packages/example/src/raw-pool-bypass.ts"),
    true,
    "the audit must reject a production source fixture that bypasses connection.ts",
  );
});
