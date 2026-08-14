/**
 * The resident broker's HTTP half — the loopback listener that joins the door
 * (`codex-claim-broker-door.ts`) to the grammar and decisions (`codex-claim-broker.ts`).
 *
 * Deliberately free of `pg` and of any credential: the identity the broker holds is composed in
 * `codex-claim-broker-entry.ts`, so this module can be started over a REAL socket against a fake
 * ledger and its transport refusals proven for what they are.
 */

import { createServer, type Server } from "node:http";

import {
  BROKER_MAX_BODY_BYTES,
  guardBrokerRequest,
  type BrokerHandshake,
} from "./codex-claim-broker-door.js";
import {
  CODEX_CLAIM_BROKER_PROTOCOL_VERSION,
  serveBrokerRequest,
  type BrokerDeps,
} from "./codex-claim-broker.js";

export interface RunningBroker {
  readonly port: number;
  readonly handshake: BrokerHandshake;
  close(): Promise<void>;
}

async function readBody(request: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    // Refuse a flood before buffering it, not after — the cap is the point.
    if (size > BROKER_MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Start the broker on an EPHEMERAL loopback port. Binding to `127.0.0.1` rather than `0.0.0.0` is
 * load-bearing: nothing off this host can reach it at all, guard or no guard.
 */
export async function startBrokerServer(args: {
  readonly deps: BrokerDeps;
  readonly token: string;
}): Promise<RunningBroker> {
  const server: Server = createServer((request, response) => {
    const answer = (status: number, payload: unknown): void => {
      const body = JSON.stringify(payload);
      response.writeHead(status, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      });
      response.end(body);
    };

    const verdict = guardBrokerRequest(
      { method: request.method, url: request.url, headers: request.headers },
      args.token,
    );
    if (!verdict.ok) {
      // The guard's reason is safe to return: it never distinguishes a wrong token from a missing
      // one, and a caller that cannot reach the door learns nothing about the ledger from it.
      answer(verdict.status, { ok: false, reason: verdict.reason });
      request.resume();
      return;
    }

    void (async () => {
      try {
        const raw: unknown = JSON.parse(await readBody(request));
        answer(200, await serveBrokerRequest(raw, args.deps));
      } catch (error) {
        // A malformed body is a refusal like any other. HTTP 200 with `ok:false` is deliberate for
        // anything past the guard: the caller reads ONE field to decide, and a transport status can
        // never be mistaken for a ledger verdict.
        answer(200, {
          ok: false,
          reason: `malformed request: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("broker did not bind a loopback port");
  }

  return {
    port: address.port,
    handshake: {
      protocolVersion: CODEX_CLAIM_BROKER_PROTOCOL_VERSION,
      port: address.port,
      token: args.token,
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections?.();
      }),
  };
}
