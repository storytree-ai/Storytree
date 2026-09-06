// Lever model for ADR-0528 D1 — run on a real exported layout (island capability counts).
import { readFileSync } from 'node:fs';
const scene = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const islands = scene.world.islands;
const HEX_AREA = (3 * Math.sqrt(3)) / 2; // × R²
const RATIO = 318;
const OLD_R = 27;
const ringsOf = (q) => (q <= 1 ? 0 : q <= 7 ? 1 : q <= 19 ? 2 : 3);
const oldQuota = (c) => Math.max(3, c + 2);
const fmt = (x, d = 2) => (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);
const caps = islands.map((i) => i.capabilities);
const hist = {};
for (const c of caps) hist[c] = (hist[c] ?? 0) + 1;
console.log(`islands ${islands.length}; capability histogram ${JSON.stringify(hist)}`);
console.log(`old tile: quota max(3, caps+2) × hex(R=${OLD_R}) = ${fmt(HEX_AREA * OLD_R * OLD_R, 1)} units² per hex`);

// TODAY: per-island 2D footprint vs the 3D island (caps × 318): the residual factor the mapper applies.
const today = islands.filter((i) => i.capabilities > 0).map((i) => {
  const q = oldQuota(i.capabilities);
  const foot = q * HEX_AREA * OLD_R * OLD_R;
  return { id: i.id, caps: i.capabilities, q, foot, land: i.capabilities * RATIO, f: Math.sqrt((i.capabilities * RATIO) / foot) };
});
const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
console.log(`\nTODAY — 2D footprint / 3D land: median ${fmt(med(today.map((t) => t.foot / t.land)), 1)}×, range ${fmt(Math.min(...today.map((t) => t.foot / t.land)), 1)}–${fmt(Math.max(...today.map((t) => t.foot / t.land)), 1)}×; edge-to-edge factor the mapper applies: median ${fmt(med(today.map((t) => t.f)), 3)}, range ${fmt(Math.min(...today.map((t) => t.f)), 3)}–${fmt(Math.max(...today.map((t) => t.f)), 3)}`);

// LEVER A — radius only, quota unchanged. One R for the whole lattice cannot make every island exact:
// footprint/land = (caps+2)/caps × hexArea(R)/318. Fit R so the MEDIAN-capability island is exact.
const medCaps = med(caps.filter((c) => c > 0));
const rA = Math.sqrt((medCaps * RATIO) / (oldQuota(medCaps) * HEX_AREA));
const leverA = today.map((t) => ({ ...t, footA: t.q * HEX_AREA * rA * rA }));
console.log(`\nLEVER A (radius only; quota stays max(3, caps+2)); R fitted so the median-capability island (${medCaps} caps) is exact: R = ${fmt(rA, 2)}`);
console.log(`  residual edge-to-edge factor the mapper still applies: ${leverA.map((t) => `${t.caps}:${fmt(Math.sqrt(t.land / t.footA), 2)}`).filter((v, i, a) => a.indexOf(v) === i).join('  ')}`);
console.log(`  → the +2 survives as an authored number, and a 1-capability island is drawn ${fmt(3 * HEX_AREA * rA * rA / RATIO, 1)}× its land; a 26-capability island ${fmt(28 * HEX_AREA * rA * rA / (26 * RATIO), 2)}×. REJECTED by D1.`);

// LEVER B — quota only, R stays 27: quota = caps × 318 / hexArea(27).
const perHexOld = HEX_AREA * OLD_R * OLD_R;
console.log(`\nLEVER B (quota only; R stays ${OLD_R}): quota = caps × ${RATIO} / ${fmt(perHexOld, 1)} = ${fmt(RATIO / perHexOld, 3)} × caps → a 1-capability island gets ${fmt(RATIO / perHexOld, 2)} of a hex; an island needs ≥ 1 whole hex, so ${caps.filter((c) => c > 0 && c * RATIO / perHexOld < 1).length} of ${caps.filter((c) => c > 0).length} islands cannot be drawn. INFEASIBLE.`);

// LEVER C — both: k tiles per capability, hex area = 318 / k. Exact for every island with caps ≥ 1.
console.log(`\nLEVER C (both): quota = k × max(1, caps), hex area = ${RATIO} / k → every island's drawn footprint is EXACTLY caps × ${RATIO}.`);
for (const k of [1, 2, 3, 4]) {
  const R = Math.sqrt(RATIO / k / HEX_AREA);
  const W = Math.sqrt(3) * R;
  const quotas = caps.map((c) => k * Math.max(1, c));
  const hexes = quotas.reduce((a, b) => a + b, 0);
  const floors = quotas.map(ringsOf);
  // the growth floor between two median islands, centre to centre, in units (hex distance × HEX_W)
  const medQ = med(quotas);
  const floorUnits = (2 * ringsOf(medQ) + 1) * W;
  const estR = (q) => Math.sqrt(q) * W * 0.62 + R;
  console.log(`  k=${k}: R = ${fmt(R, 2)} (TILE_SCALE ${fmt(R / OLD_R, 4)}), HEX_W = ${fmt(W, 2)}; hexes on the map ${hexes} (today ${caps.map(oldQuota).reduce((a, b) => a + b, 0)}); quota range ${Math.min(...quotas)}–${Math.max(...quotas)} (rings ${Math.min(...floors)}–${Math.max(...floors)}); median island quota ${medQ}, estRadius ${fmt(estR(medQ), 1)}, lattice floor between two of them ${fmt(floorUnits, 1)} units centre-to-centre`);
}
console.log(`\nfor reference today: median quota ${med(caps.map(oldQuota))}, estRadius ${fmt(Math.sqrt(med(caps.map(oldQuota))) * Math.sqrt(3) * OLD_R * 0.62 + OLD_R, 1)}, lattice floor ${fmt((2 * ringsOf(med(caps.map(oldQuota))) + 1) * Math.sqrt(3) * OLD_R, 1)} units`);
