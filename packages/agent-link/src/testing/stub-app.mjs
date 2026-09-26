// A stand-in for the storytree app, for the setup check's tests (contract 8.3): started as
// `stub-app.mjs <dataDir> <port>`, it writes the owner record the app's Postgres keeps beside its
// data directory, naming itself and the test server's port, then waits until it is killed.
import { writeFileSync } from "node:fs";

const [dataDir, port] = process.argv.slice(2);
writeFileSync(`${dataDir}.owner.json`, JSON.stringify({ pid: process.pid, token: "stub", owner: "a stand-in storytree app", port: Number(port), startedAt: new Date().toISOString() }));
setInterval(() => {}, 60_000);
