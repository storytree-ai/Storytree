import { readdirSync, readFileSync, statSync } from 'node:fs';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
const dir = process.argv[2] ?? '/tmp/pine/out';
const rows = [];
for (const f of readdirSync(dir).filter(x => x.endsWith('.glb')).sort()) {
  const b = readFileSync(`${dir}/${f}`);
  rows.push({
    file: f, raw: b.byteLength,
    br: brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength,
    gz: gzipSync(b, { level: 9 }).byteLength,
  });
}
for (const r of rows) console.log(`${r.file.padEnd(26)} raw=${String(r.raw).padStart(9)} br=${String(r.br).padStart(9)} gz=${String(r.gz).padStart(9)}`);
