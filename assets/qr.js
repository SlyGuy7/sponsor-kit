/* A small QR code encoder: byte mode, error correction level M, versions 1 to 10 (up to 213 bytes).
   Written for this site so the printout can carry a code that reopens the kit, without loading
   anything from another site. It follows ISO/IEC 18004; tests/qr.test.js checks it against the
   standard's worked examples. Returns a square grid of booleans (true = dark), no quiet zone. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QR = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Level M, per version: error-correction codewords per block, then [block count, data codewords per block] groups.
  const BLOCKS = [null,
    [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
    [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const dataCodewords = v => BLOCKS[v].slice(1).reduce((n, [c, d]) => n + c * d, 0);
  const countBits = v => v < 10 ? 8 : 16;
  const capacity = v => Math.floor((dataCodewords(v) * 8 - 4 - countBits(v)) / 8);

  /* ---------- Reed-Solomon over GF(256), polynomial 0x11D ---------- */
  function mul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 0xFF;
  }
  function divisor(degree) {
    const r = new Array(degree).fill(0); r[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) { r[j] = mul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
      root = mul(root, 2);
    }
    return r;
  }
  function ecc(data, degree) {
    const div = divisor(degree), r = new Array(degree).fill(0);
    data.forEach(b => { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mul(c, f); }); });
    return r;
  }

  /* ---------- codewords: data bits, padding, blocks, interleaving ---------- */
  function codewords(bytes, v) {
    const bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, countBits(v)); bytes.forEach(b => put(b, 8));
    const cap = dataCodewords(v) * 8;
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a << 1 | b, 0));
    const [ecLen, ...groups] = BLOCKS[v], blocks = [];
    let at = 0;
    groups.forEach(([count, len]) => { for (let i = 0; i < count; i++) { blocks.push(data.slice(at, at + len)); at += len; } });
    const out = [], longest = Math.max(...blocks.map(b => b.length)), eccs = blocks.map(b => ecc(b, ecLen));
    for (let i = 0; i < longest; i++) blocks.forEach(b => { if (i < b.length) out.push(b[i]); });
    for (let i = 0; i < ecLen; i++) eccs.forEach(e => out.push(e[i]));
    return out;
  }

  /* ---------- format and version information ---------- */
  function formatBits(mask) {          // level M is 00
    const data = (0 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }
  function versionBits(v) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    return (v << 12) | rem;
  }

  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];

  // Penalty rules from the standard, used to pick the mask that is easiest to scan.
  function penalty(m) {
    const n = m.length; let p = 0, dark = 0;
    const lines = [];
    for (let i = 0; i < n; i++) { lines.push(m[i]); lines.push(m.map(r => r[i])); }
    lines.forEach(line => {
      let run = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && line[i] === line[i - 1]) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      const s = line.map(b => b ? 1 : 0).join('');
      for (const pat of ['10111010000', '00001011101']) for (let i = s.indexOf(pat); i !== -1; i = s.indexOf(pat, i + 1)) p += 40;
    });
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (m[y][x]) dark++;
      if (x < n - 1 && y < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
    return p + 10 * Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n));
  }

  function make(text) {
    const bytes = [...new TextEncoder().encode(String(text))];
    let v = 1;
    while (v <= 10 && capacity(v) < bytes.length) v++;
    if (v > 10) throw new Error('Too long for a QR code here: ' + bytes.length + ' bytes');
    const n = 17 + 4 * v;
    const m = Array.from({ length: n }, () => new Array(n).fill(false));
    const fixed = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (x, y, dark) => { m[y][x] = dark; fixed[y][x] = true; };

    for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    [[3, 3], [n - 4, 3], [3, n - 4]].forEach(([cx, cy]) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < n && y >= 0 && y < n) set(x, y, d !== 2 && d !== 4);
      }
    });
    const al = ALIGN[v], last = al.length - 1;
    al.forEach((cy, i) => al.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    const drawFormat = mask => {
      const b = formatBits(mask), bit = i => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
      set(8, n - 8, true);
    };
    drawFormat(0);                              // reserves the format areas
    if (v >= 7) {
      const b = versionBits(v);
      for (let i = 0; i < 18; i++) { const dark = ((b >>> i) & 1) === 1, a = n - 11 + i % 3, c = Math.floor(i / 3); set(a, c, dark); set(c, a, dark); }
    }

    // Data modules: two-column zigzag from the bottom right, skipping the vertical timing column.
    const cw = codewords(bytes, v), total = cw.length * 8;
    let k = 0;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
        if (!fixed[y][x] && k < total) { m[y][x] = ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
      }
    }

    let best = null, bestScore = Infinity, bestMask = 0;
    MASKS.forEach((fn, mask) => {
      const t = m.map((row, y) => row.map((dark, x) => fixed[y][x] ? dark : dark !== fn(x, y)));
      const save = m.map(r => r.slice());
      m.forEach((row, y) => row.forEach((_, x) => { m[y][x] = t[y][x]; }));
      drawFormat(mask);
      const score = penalty(m);
      if (score < bestScore) { bestScore = score; bestMask = mask; best = m.map(r => r.slice()); }
      save.forEach((row, y) => { m[y] = row; });
    });
    return { modules: best, fixed, version: v, mask: bestMask, codewords: cw };
  }
  const encode = text => make(text).modules;

  return { encode, make, MASKS, capacity, formatBits, versionBits, ecc, codewords };
});
