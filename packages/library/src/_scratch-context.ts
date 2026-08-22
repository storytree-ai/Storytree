import { createPool } from "@storytree/library/store";

const targets = ["adr-0405", "adr-0408", "adr-0186", "adr-0106", "adr-0090", "adr-0155", "adr-0116", "adr-0299"];
const needles = [
  "terminal-tabs",
  "poisoned",
  "unbound",
  "BuildSection",
  "/api/build",
  "forest-map Build",
  "map Build seed",
  "Build seed",
];

async function main() {
  const handle = await createPool();
  const { rows } = await handle.pool.query(
    `select id, doc->>'title' as title, doc->>'body' as body
     from events.library_artifact
     where kind = 'adr' and id = any($1::text[])`,
    [targets],
  );
  for (const row of rows as any[]) {
    console.log(`\n\n########## ${row.id} — ${row.title} ##########`);
    const body: string = row.body ?? "";
    for (const needle of needles) {
      let idx = body.indexOf(needle);
      let count = 0;
      while (idx !== -1 && count < 5) {
        const start = Math.max(0, idx - 200);
        const end = Math.min(body.length, idx + needle.length + 200);
        console.log(`\n--- "${needle}" @${idx} ---\n...${body.slice(start, end)}...`);
        idx = body.indexOf(needle, idx + needle.length);
        count++;
      }
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
