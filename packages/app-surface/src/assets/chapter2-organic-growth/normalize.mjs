import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error('Expected a non-interlaced 8-bit RGBA PNG');
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  const packed = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[inputOffset++];
    for (let x = 0; x < stride; x += 1) {
      const value = packed[inputOffset++];
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const up = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? rgba[(y - 1) * stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }
      rgba[y * stride + x] = (value + predictor) & 255;
    }
  }
  return { width, height, rgba };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return result;
}

function encodePng({ width, height, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const scanlines = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    scanlines[rowOffset] = 0;
    rgba.copy(scanlines, rowOffset + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function findGroundContact(image) {
  for (let y = image.height - 1; y >= 0; y -= 1) {
    const occupied = [];
    for (let x = 0; x < image.width; x += 1) {
      if (image.rgba[(y * image.width + x) * 4 + 3] > 0) occupied.push(x);
    }
    if (occupied.length > 0) {
      return { x: occupied[Math.floor(occupied.length / 2)], y };
    }
  }
  throw new Error('Transparent input has no visible pixels');
}

function alphaAt(image, point) {
  if (point.x < 0 || point.x >= image.width || point.y < 0 || point.y >= image.height) return 0;
  return image.rgba[(point.y * image.width + point.x) * 4 + 3];
}

function visibleBounds(image) {
  const bounds = { minX: image.width, minY: image.height, maxX: -1, maxY: -1 };
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.rgba[(y * image.width + x) * 4 + 3] === 0) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return bounds;
}

function translate(image, dx, dy) {
  const rgba = Buffer.alloc(image.rgba.length);
  let clippedPixels = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sourceOffset = (y * image.width + x) * 4;
      if (image.rgba[sourceOffset + 3] === 0) continue;
      const targetX = x + dx;
      const targetY = y + dy;
      if (targetX < 0 || targetX >= image.width || targetY < 0 || targetY >= image.height) {
        clippedPixels += 1;
        continue;
      }
      image.rgba.copy(rgba, (targetY * image.width + targetX) * 4, sourceOffset, sourceOffset + 4);
    }
  }
  if (clippedPixels > 0) {
    throw new Error(
      `Translation (${dx},${dy}) clipped ${clippedPixels} visible pixels from ${JSON.stringify(visibleBounds(image))}`,
    );
  }
  return { ...image, rgba };
}

const [inputPath, outputPath, anchorXText, anchorYText, sourceXText, sourceYText] =
  process.argv.slice(2);
if (!inputPath || !outputPath || anchorXText === undefined || anchorYText === undefined) {
  throw new Error(
    'Usage: node normalize.mjs <input.png> <output.png> <anchor-x> <anchor-y> [source-x source-y]',
  );
}
const anchor = { x: Number(anchorXText), y: Number(anchorYText) };
const input = decodePng(readFileSync(inputPath));
const sourceContact =
  sourceXText === undefined || sourceYText === undefined
    ? findGroundContact(input)
    : { x: Number(sourceXText), y: Number(sourceYText) };
if (alphaAt(input, sourceContact) === 0) {
  throw new Error(`Declared source contact ${JSON.stringify(sourceContact)} is transparent.`);
}
const offset = { x: anchor.x - sourceContact.x, y: anchor.y - sourceContact.y };
const normalized = translate(input, offset.x, offset.y);
writeFileSync(outputPath, encodePng(normalized));
if (alphaAt(normalized, anchor) === 0) {
  throw new Error(`Normalized anchor ${JSON.stringify(anchor)} is transparent.`);
}
process.stdout.write(
  `${JSON.stringify({
    inputPath,
    outputPath,
    canvas: { width: input.width, height: input.height },
    sourceContact,
    sourceBounds: visibleBounds(input),
    offset,
    outputContact: anchor,
    outputBounds: visibleBounds(normalized),
  })}\n`,
);
