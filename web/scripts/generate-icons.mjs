/**
 * Generates the PWA icon set (a white heart on the Anivi pink gradient).
 *
 * The icons are drawn from a formula and encoded as PNGs here rather than
 * checked in as binaries, so the app icon can be tweaked by editing numbers.
 *
 *   node scripts/generate-icons.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const TOP = [255, 122, 162]; // #ff7aa2
const BOTTOM = [232, 56, 108]; // #e8386c

/** Implicit heart curve: (x^2 + y^2 - 1)^3 - x^2 y^3 <= 0. */
function insideHeart(x, y) {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}

function renderIcon(size, heartScale) {
  // RGBA, one filter byte per scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const supersample = 3; // cheap antialiasing for the heart edge

  for (let py = 0; py < size; py++) {
    const rowStart = py * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none

    const t = py / (size - 1);
    const bg = [
      Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
      Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
      Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t),
    ];

    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < supersample; sy++) {
        for (let sx = 0; sx < supersample; sx++) {
          const fx = px + (sx + 0.5) / supersample;
          const fy = py + (sy + 0.5) / supersample;
          // Map pixel space into the heart's coordinate system, nudged down a
          // little so the lobes sit optically centred.
          const x = ((fx / size) * 2 - 1) / heartScale;
          const y = (1 - (fy / size) * 2 + 0.22) / heartScale;
          if (insideHeart(x, y)) hits++;
        }
      }
      const alpha = hits / (supersample * supersample);
      const i = rowStart + 1 + px * 4;
      raw[i] = Math.round(bg[0] + (255 - bg[0]) * alpha);
      raw[i + 1] = Math.round(bg[1] + (255 - bg[1]) * alpha);
      raw[i + 2] = Math.round(bg[2] + (255 - bg[2]) * alpha);
      raw[i + 3] = 255;
    }
  }
  return encodePng(size, size, raw);
}

/* ---- minimal PNG encoder ---- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });

const icons = [
  ['icon-192.png', 192, 0.78],
  ['icon-512.png', 512, 0.78],
  ['icon-180.png', 180, 0.78],
  // Maskable icons lose their outer ~10%, so the heart sits smaller.
  ['icon-maskable-512.png', 512, 0.56],
];

for (const [name, size, scale] of icons) {
  writeFileSync(join(OUT_DIR, name), renderIcon(size, scale));
  console.log(`anivi: wrote icons/${name} (${size}x${size})`);
}
