import { createPool, closePool } from "@storytree/library/store/connection";
import { PgClaimStore } from "@storytree/notice-board/store/claim-store";

const CLAIM_READER_DATABASE_USER =
  "storytree-codex-claim-reader@storytree-498613.iam";
const CLAIM_READER_SERVICE_ACCOUNT =
  "storytree-codex-claim-reader@storytree-498613.iam.gserviceaccount.com";

function fail(reason: string): void {
  process.stderr.write(`Storytree Codex live-claim probe failed closed: ${reason}\n`);
  process.exitCode = 2;
}

async function readStdin(): Promise<string> {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main(): Promise<void> {
  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    const request = JSON.parse(await readStdin()) as Record<string, unknown>;
    if (request["protocolVersion"] !== 1 || request["readMode"] !== "live-claims-required") {
      throw new Error("unsupported or missing live-read protocol");
    }
    if (typeof request["sessionId"] !== "string" || request["sessionId"].trim() === "") {
      throw new Error("sessionId is required");
    }
    handle = await createPool({
      user: CLAIM_READER_DATABASE_USER,
      impersonateServiceAccount: CLAIM_READER_SERVICE_ACCOUNT,
    });
    const claims = await new PgClaimStore(handle.pool).claimsBySession(request["sessionId"]);
    process.stdout.write(JSON.stringify({ claims }));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    if (handle) await closePool(handle.pool, handle.connector);
  }
}

void main();
