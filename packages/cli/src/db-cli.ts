// Entry for the db:* npm scripts (ADR-0063): up / down / status over the Cloud SQL Admin REST API
// (no gcloud subprocess, so they never feed the credential-lock cascade), reusing db-control.ts's
// REST effects. Thin I/O shell — the decisions it calls are unit-tested in db-control.ts; this is
// just argv → effect → stdout.

import { ensureLiveDb, statusLiveDbViaRest, stopLiveDbViaRest } from "@storytree/drive";

async function main(): Promise<void> {
  // Root scripts delegate via `pnpm --filter @storytree/cli db -- <action>` (the storytree-script
  // pattern), so a leading "--" arrives as argv[0]; strip it.
  const argv = process.argv.slice(2);
  const action = argv[0] === "--" ? argv[1] : argv[0];
  const log = (m: string): void => console.error(`[db] ${m}`);
  switch (action) {
    case "up": {
      const res = await ensureLiveDb(log);
      if (!res.ok) {
        console.error(res.reason);
        // A still-warming refusal is a WAIT, not a wedge: the start was issued and the instance
        // reports ALWAYS — re-probe, never re-start. Exit EX_TEMPFAIL (75) so callers/operators
        // can tell it from genuinely unreachable (1) without parsing the message.
        process.exitCode = res.stillWarming === true ? 75 : 1;
        return;
      }
      console.log(res.started ? "RUNNABLE (started)" : "RUNNABLE (already up)");
      return;
    }
    case "down": {
      await stopLiveDbViaRest();
      console.log("activationPolicy=NEVER requested (the instance stops shortly)");
      return;
    }
    case "status": {
      const s = await statusLiveDbViaRest();
      // Mirror the old gcloud `--format="value(state,settings.activationPolicy)"` shape.
      console.log(`${s.state}\t${s.activationPolicy}`);
      return;
    }
    default:
      console.error("usage: db-cli <up|down|status>");
      process.exitCode = 2;
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
