/**
 * The STANDALONE host for the resident claim broker — a headless fallback, no longer the default.
 *
 * ## Read this before changing how it starts
 *
 * **Codex must never be able to launch this.** That is not a preference, it is the entire repair. The
 * existing trusted actuator is hash-pinned, exact-grammar, exact-arity and topology-verified, and it
 * STILL fails, because Codex invokes it and it therefore runs with the sandbox's token — the very
 * token `Protect-SandboxCredentials` has just denied every credential path. Authentication is
 * something a process HAS by virtue of who started it. A broker started on demand by the writer is
 * the actuator again, wearing a new name.
 *
 * So this is started by the OPERATOR, and the sandboxed writer only ever sends it a message.
 *
 * ## Which host should be running (ADR-0375)
 *
 * The storytree **desktop app** is now the ordinary holder: it is already a long-lived operator
 * process, and the managed hook reads live claims through it on every covered tool call, so a warm
 * pool is what makes the fence usable at all (a per-call connector build measured 19–48 s against a
 * 30 s budget and refused legitimate writes on a coin flip).
 *
 * This entry is retained for a **headless host with no desktop app**. The two must not run at once:
 * they race for the same handshake file, and the loser publishes a port the winner is not listening
 * on. The composition below refuses nothing about that — it is an operator responsibility, stated in
 * `infra/codex-claim-broker.md`.
 *
 * Run it (from a checkout of the repository it should serve):
 *
 *     pnpm -C packages/cli exec node --import tsx src/codex-claim-broker-entry.ts
 */

import { startResidentClaimBroker } from "./codex-claim-broker-resident.js";

async function main(): Promise<void> {
  const broker = await startResidentClaimBroker({ env: process.env, cwd: process.cwd() });

  const shutdown = (signal: string): void => {
    process.stderr.write(`storytree codex claim broker: ${signal} — shutting down\n`);
    void (async () => {
      await broker.close();
      process.exit(0);
    })();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `storytree codex claim broker failed closed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
});
