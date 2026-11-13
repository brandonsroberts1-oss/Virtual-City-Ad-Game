// Minimal PNG support with no dependencies: checking that an uploaded logo
// really is a small PNG, and writing PNGs for the sample logos.

import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const LOGO_MAX_BYTES = 120 * 1024;
export const LOGO_MAX_SIDE = 256;

// Accepts a "data:image/png;base64,..." string. Returns
//   { ok: true, bytes: Buffer }  a valid logo
//   { ok: true, bytes: null }    nothing supplied
//   { ok: false, reason }        something that is not an acceptable PNG
export function parseLogo(input) {
  if (input == null || input === '') return { ok: true, bytes: null };
  if (typeof input !== 'string') return { ok: false, reason: 'The logo must be an image.' };
  const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
  if (!m) return { ok: false, reason: 'The logo must be a PNG image.' };
  if (m[1].length > LOGO_MAX_BYTES * 1.4) return { ok: false, reason: 'That logo file is too big.' };
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, reason: 'That logo file is too big.' };
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(SIGNATURE) || bytes.toString('latin1', 12, 16) !== 'IHDR') {
    return { ok: false, reason: 'The logo must be a PNG image.' };
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 8 || height < 8 || width > LOGO_MAX_SIDE || height > LOGO_MAX_SIDE) {
    return { ok: false, reason: `The logo must be between 8 and ${LOGO_MAX_SIDE} pixels on each side.` };
  }
  return { ok: true, bytes };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

// rgba: Uint8Array of width * height * 4 bytes
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // no filter
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
