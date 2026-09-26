// A stand-in for the storytree app, for the setup check's tests (contract 8.3): started as
// `stub-app.mjs <dataDir> <port> [listenAfterMs]`, it writes the owner record the app's Postgres
// keeps beside its data directory, naming itself and `port`, then waits until it is killed. Given
// `listenAfterMs`, it also listens on `port` itself, but only that long after writing the record,
// as the app's Postgres starts listening a moment after the record is written.
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";

const [dataDir, port, listenAfterMs] = process.argv.slice(2);
writeFileSync(`${dataDir}.owner.json`, JSON.stringify({ pid: process.pid, token: "stub", owner: "a stand-in storytree app", port: Number(port), startedAt: new Date().toISOString() }));
if (listenAfterMs !== undefined) {
  setTimeout(() => createServer((socket) => socket.end()).listen(Number(port), "127.0.0.1"), Number(listenAfterMs));
}
setInterval(() => {}, 60_000);
