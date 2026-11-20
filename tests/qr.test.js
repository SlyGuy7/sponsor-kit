// Tests for the QR encoder (assets/qr.js): known values from the QR standard, plus a reader that
// decodes every generated code back to its text using the standard's layout rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../assets/qr.js');

// ISO/IEC 18004 worked example ("HELLO WORLD", version 1-M): data codewords and their 10 error-correction codewords.
test('Reed-Solomon error correction matches the standard\'s worked example', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(Q.ecc(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('format and version information match the standard\'s tables', () => {
  const M = ['101010000010010', '101000100100101', '101111001111100', '101101101001011',
    '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
  M.forEach((bits, mask) => assert.equal(Q.formatBits(mask).toString(2).padStart(15, '0'), bits, 'mask ' + mask));
  assert.equal(Q.versionBits(7).toString(2).padStart(18, '0'), '000111110010010100');
  assert.equal(Q.versionBits(10).toString(2).padStart(18, '0'), '001010010011010011');
});

test('byte capacity per version (level M) matches the standard', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(Q.capacity), [14, 26, 42, 62, 84, 106, 122, 152, 180, 213]);
});

// Block structure for level M, typed in again here from the standard so a slip in qr.js would not hide itself.
const BLOCKS = { 1: [10, [16]], 2: [16, [28]], 3: [26, [44]], 4: [18, [32, 32]], 5: [24, [43, 43]], 6: [16, [27, 27, 27, 27]],
  7: [18, [31, 31, 31, 31]], 8: [22, [38, 38, 39, 39]], 9: [22, [36, 36, 36, 37, 37]], 10: [26, [43, 43, 43, 43, 44]] };

function read(r) {
  const m = r.modules, n = m.length, v = (n - 17) / 4;
  // format information, both copies
  let a = 0, b = 0;
  const A = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  A.forEach(([x, y], i) => { if (m[y][x]) a |= 1 << i; });
  for (let i = 0; i < 8; i++) if (m[8][n - 1 - i]) b |= 1 << i;
  for (let i = 8; i < 15; i++) if (m[n - 15 + i][8]) b |= 1 << i;
  assert.equal(a, b, 'the two format copies agree');
  const mask = [0, 1, 2, 3, 4, 5, 6, 7].find(k => Q.formatBits(k) === a);
  assert.notEqual(mask, undefined, 'format information is a valid level-M code');
  if (v >= 7) {
    let tr = 0, bl = 0;
    for (let i = 0; i < 18; i++) { const p = n - 11 + i % 3, q = Math.floor(i / 3); if (m[q][p]) tr |= 1 << i; if (m[p][q]) bl |= 1 << i; }
    assert.equal(tr, Q.versionBits(v)); assert.equal(bl, Q.versionBits(v));
  }
  // zigzag read, unmasking data modules
  const bits = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
      if (!r.fixed[y][x]) bits.push(m[y][x] !== Q.MASKS[mask](x, y) ? 1 : 0);
    }
  }
  const [ecLen, lens] = BLOCKS[v], total = lens.reduce((s, l) => s + l, 0) + ecLen * lens.length;
  const cw = [];
  for (let i = 0; i < total * 8; i += 8) cw.push(bits.slice(i, i + 8).reduce((s, x) => s << 1 | x, 0));
  // de-interleave and check each block's error correction
  const blocks = lens.map(() => []), ecs = lens.map(() => []);
  let k = 0;
  for (let i = 0; i < Math.max(...lens); i++) lens.forEach((l, bi) => { if (i < l) blocks[bi].push(cw[k++]); });
  for (let i = 0; i < ecLen; i++) lens.forEach((_, bi) => ecs[bi].push(cw[k++]));
  blocks.forEach((blk, bi) => assert.deepEqual(Q.ecc(blk, ecLen), ecs[bi], 'block ' + bi + ' error correction'));
  // parse byte-mode data
  const data = [].concat(...blocks), dbits = [];
  data.forEach(byte => { for (let i = 7; i >= 0; i--) dbits.push((byte >>> i) & 1); });
  const take = n2 => { let x = 0; for (let i = 0; i < n2; i++) x = x << 1 | dbits.shift(); return x; };
  assert.equal(take(4), 4, 'byte mode');
  const len = take(v < 10 ? 8 : 16), out = [];
  for (let i = 0; i < len; i++) out.push(take(8));
  return { text: new TextDecoder().decode(new Uint8Array(out)), version: v, mask };
}

test('every size of code reads back to its text (versions 1 to 10)', () => {
  const base = 'https://slyguy7.github.io/sponsor-kit/#kit=1_';
  const seen = new Set();
  for (const len of [1, 14, 15, 26, 27, 42, 43, 62, 63, 84, 85, 106, 107, 122, 123, 152, 153, 180, 181, 213]) {
    const text = (base + '4-0_8--32--3--_14-1_16-2_18-1_19-4_'.repeat(10)).slice(0, len);
    const r = Q.make(text);
    const back = read(r);
    assert.equal(back.text, text, 'length ' + len);
    seen.add(r.version);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.throws(() => Q.make('x'.repeat(214)), /Too long/);
});

test('fixed patterns: finders, timing and the dark module are where scanners look for them', () => {
  const m = Q.encode('https://slyguy7.github.io/sponsor-kit/#kit=1_4-0'), n = m.length;
  const finder = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
    finder.forEach((row, y) => [...row].forEach((c, x) => assert.equal(m[oy + y][ox + x], c === '1')));
  }
  for (let i = 8; i < n - 8; i++) { assert.equal(m[6][i], i % 2 === 0); assert.equal(m[i][6], i % 2 === 0); }
  assert.equal(m[n - 8][8], true);
});

test('a real kit link fits, and the same link always gives the same code', () => {
  const url = 'https://slyguy7.github.io/sponsor-kit/#kit=1_1-3_2-0_3-1_4-0_5-0123450_6-1_7-0.3_8-01234012_9-2_10-1_11-2_12-0_13-1_14-x1_15-2_16-4_17-3_18-1.5_19-x0';
  const r = Q.make(url);
  assert.equal(read(r).text, url);
  assert.ok(r.version <= 10, 'version ' + r.version);     // a link answering every question needs version 8 (49x49)
  assert.deepEqual(Q.encode(url), r.modules);
});
