import { readFileSync } from 'node:fs';
const f = process.argv[2];
const buf = readFileSync(f);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
let off = 12, json = null, binLen = 0;
while (off < buf.byteLength) {
  const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
  if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buf.subarray(off + 8, off + 8 + len)));
  if (type === 0x004e4942) binLen = len;
  off += 8 + len + ((4 - (len % 4)) % 4);
}
const g = json;
const imgs = (g.images ?? []).map((im, i) => {
  const bv = g.bufferViews[im.bufferView];
  return { i, name: im.name, mime: im.mimeType, bytes: bv.byteLength };
});
const totalImg = imgs.reduce((a, b) => a + b.bytes, 0);
console.log(JSON.stringify({
  file: f, fileBytes: buf.byteLength, binBytes: binLen, jsonBytes: JSON.stringify(g).length,
  extensionsUsed: g.extensionsUsed, meshes: (g.meshes??[]).map(m=>({name:m.name, prims:m.primitives.length})),
  accessorTotal: (g.accessors??[]).length,
  materials: (g.materials??[]).map(m=>({name:m.name, alphaMode:m.alphaMode, doubleSided:m.doubleSided,
    tex: Object.entries({base:m.pbrMetallicRoughness?.baseColorTexture, mr:m.pbrMetallicRoughness?.metallicRoughnessTexture, n:m.normalTexture, occ:m.occlusionTexture, em:m.emissiveTexture}).filter(([,v])=>v).map(([k,v])=>[k, v.index])})),
  images: imgs, totalImageBytes: totalImg, geometryBytes: binLen - totalImg,
}, null, 1));
