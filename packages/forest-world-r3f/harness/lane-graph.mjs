// lane-graph.mjs — the ownership-lane instrument for packages/forest-world-r3f/src.
//
// WHY THIS EXISTS. `rendering-engine-structure-arc` split this package's modules into four one-way
// capability lanes and required the partition be PROVEN rather than asserted. Re-deriving that by
// hand is expensive and was got wrong once already: the 2026-09-08 probe reported ZERO edges
// because this package imports with SINGLE quotes and the probe matched double. A zero-edge graph
// is the shape of an instrument bug, not a finding.
//
// THE DISTINCTION THAT DECIDES LANES. A `import type { … }` edge is erased at runtime but still
// binds at compile time. Measured 2026-09-12: the runtime graph is a clean DAG (zero value-edge
// cycles, 13 layers), while THREE cycles exist once type edges are counted —
//   world-to-3d <-> land-per-capability <-> true-footprint,  and  cell-ground-geometry <-> stepped-skirt.
// Members of a type cycle MUST share a lane, or the partition has a compile-time backedge. Any
// instrument that does not separate the two edge kinds will either miss that constraint or invent
// cycles that do not exist at runtime.
//
// USAGE
//   node harness/lane-graph.mjs cycles              — value cycles vs value+type cycles
//   node harness/lane-graph.mjs layers              — longest-path depth + in-degree
//   node harness/lane-graph.mjs lanes <lanes.json>  — backedge check for a proposed partition
//
// `lanes.json` is `{ "<lane>": ["<module>", …], … }` in dependency order: a lane may depend only on
// EARLIER lanes. Module names carry no extension. A leading-underscore lane is a holding pen for
// modules this package contains but this capability does not own (`index`, `act2-director`).

import fs from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dirname, "..", "src");
const files = fs.readdirSync(SRC).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
const moduleName = (f) => f.replace(/\.tsx?$/, "");
const isLocal = (target) => files.some((f) => moduleName(f) === target);

/** Intra-package edges, split by whether the import survives to runtime. */
function readEdges() {
  const value = new Map();
  const type = new Map();
  for (const file of files) {
    const src = fs.readFileSync(path.join(SRC, file), "utf8");
    const v = new Set();
    const t = new Set();
    // Both quote styles; the clause may span lines.
    const re = /import\s+(type\s+)?([\s\S]*?)\s*from\s*['"]\.\/([A-Za-z0-9._/-]+?)(?:\.js)?['"]/g;
    let m;
    while ((m = re.exec(src))) {
      const [, typeKeyword, clause, target] = m;
      if (!isLocal(target)) continue;
      if (typeKeyword) {
        t.add(target); // `import type { … } from`
        continue;
      }
      // Inline form: a type-only edge iff EVERY specifier is `type`-prefixed.
      const inner = clause.replace(/^\{|\}$/g, "").trim();
      const specifiers = inner ? inner.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const allType = specifiers.length > 0 && specifiers.every((s) => /^type\s/.test(s));
      (allType ? t : v).add(target);
    }
    for (const target of v) t.delete(target); // a value edge subsumes a type edge to the same module
    value.set(moduleName(file), v);
    type.set(moduleName(file), t);
  }
  return { value, type };
}

const { value: valueEdges, type: typeEdges } = readEdges();
const combined = new Map(
  [...valueEdges].map(([k, v]) => [k, new Set([...v, ...(typeEdges.get(k) ?? [])])]),
);

function findCycles(edges) {
  const found = [];
  const colour = new Map();
  const stack = [];
  const walk = (node) => {
    colour.set(node, 1);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if (!edges.has(next)) continue;
      if (colour.get(next) === 1) found.push([...stack.slice(stack.indexOf(next)), next].join(" -> "));
      else if (!colour.has(next)) walk(next);
    }
    colour.set(node, 2);
    stack.pop();
  };
  for (const node of edges.keys()) if (!colour.has(node)) walk(node);
  return found;
}

const [, , command, lanesPath] = process.argv;

if (command === "cycles") {
  const valueCycles = findCycles(valueEdges);
  const allCycles = findCycles(combined);
  console.log(`VALUE-edge cycles (runtime): ${valueCycles.length || "none"}`);
  valueCycles.forEach((c) => console.log(`  ${c}`));
  console.log(`VALUE+TYPE cycles (compile time): ${allCycles.length || "none"}`);
  allCycles.forEach((c) => console.log(`  ${c}`));
  if (allCycles.length) {
    console.log("\nEach ring above must sit inside ONE lane, or the partition has a type backedge.");
  }
} else if (command === "layers") {
  const depth = new Map();
  const depthOf = (node) => {
    if (depth.has(node)) return depth.get(node);
    depth.set(node, 0); // guards the (impossible-for-value-edges) cyclic case
    const own = [...(valueEdges.get(node) ?? [])].filter((n) => valueEdges.has(n));
    const d = Math.max(0, ...own.map((n) => depthOf(n) + 1));
    depth.set(node, d);
    return d;
  };
  for (const node of valueEdges.keys()) depthOf(node);
  const byDepth = new Map();
  for (const [node, d] of depth) byDepth.set(d, [...(byDepth.get(d) ?? []), node]);
  for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
    console.log(`depth ${d}: ${byDepth.get(d).sort().join(" ")}`);
  }
  const inDegree = new Map();
  for (const [, targets] of valueEdges) {
    for (const t of targets) inDegree.set(t, (inDegree.get(t) ?? 0) + 1);
  }
  console.log("\nin-degree (value edges) — the modules a lane boundary must not cut carelessly:");
  [...inDegree]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .forEach(([node, count]) => console.log(`  ${String(count).padStart(2)}  ${node}`));
} else if (command === "lanes") {
  if (!lanesPath) throw new Error("usage: node harness/lane-graph.mjs lanes <lanes.json>");
  const lanes = JSON.parse(fs.readFileSync(lanesPath, "utf8"));
  const order = Object.keys(lanes);
  const owner = new Map();
  for (const [lane, modules] of Object.entries(lanes)) for (const m of modules) owner.set(m, lane);

  const unassigned = files.map(moduleName).filter((m) => !owner.has(m));
  if (unassigned.length) console.log(`⚠ UNASSIGNED (${unassigned.length}): ${unassigned.join(", ")}\n`);

  console.log(`lane order (a lane may depend only on EARLIER lanes): ${order.join(" -> ")}\n`);
  const rank = (lane) => order.indexOf(lane);
  let failed = unassigned.length > 0;
  for (const [label, edges] of [["VALUE", valueEdges], ["TYPE", typeEdges]]) {
    const back = [];
    for (const [from, targets] of edges) {
      for (const to of targets) {
        if (owner.get(from) !== owner.get(to) && rank(owner.get(to)) > rank(owner.get(from))) {
          back.push(`  ✗ ${from} [${owner.get(from)}] -> ${to} [${owner.get(to)}]`);
        }
      }
    }
    console.log(`${label} backedges: ${back.length || "NONE"}`);
    back.forEach((line) => console.log(line));
    if (back.length) failed = true;
  }
  console.log("");
  for (const lane of order) console.log(`  ${lane}: ${lanes[lane].length} modules`);
  process.exitCode = failed ? 1 : 0;
} else {
  console.log("usage: node harness/lane-graph.mjs <cycles|layers|lanes <lanes.json>>");
  process.exitCode = 2;
}
