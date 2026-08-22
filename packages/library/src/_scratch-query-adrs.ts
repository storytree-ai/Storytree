import { createPool, closePool } from "@storytree/library/store";

async function main() {
  const handle = await createPool();
  try {
    const { rows } = await handle.pool.query(
      `select id, doc->>'status' as status, doc->>'title' as title, doc->>'body' as body
       from events.library_artifact
       where kind = 'adr' and doc->>'status' = 'accepted'`,
    );
    console.log(`accepted ADR count: ${rows.length}`);

    const needles = [
      "/api/build",
      "BuildSection",
      "forest-map Build",
      "forest map's Build",
      "Build button",
      "onSeedTerminal",
      "terminal seed",
      "seed producer",
      "uatc_79f9db93ca0e89aaaec2d522",
      "uatc_abc366dff450e75d3ab91e60",
      "terminal-tabs#uat-4",
      "terminal-tabs#uat-7",
      "terminal-tabs",
      "poisoned",
      "unbound-machine-leg",
      "unbound machine leg",
    ];

    for (const needle of needles) {
      const hits = rows.filter((r: any) => typeof r.body === "string" && r.body.includes(needle));
      console.log(`\n=== "${needle}" — ${hits.length} accepted ADR(s) ===`);
      for (const h of hits) {
        console.log(`  ${h.id}  ${h.title}`);
      }
    }
  } finally {
    await closePool(handle);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
