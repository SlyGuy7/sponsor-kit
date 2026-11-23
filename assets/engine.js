/* Sponsor readiness engine: turns one sponsor's survey answers into a personalised kit.
   Copied from the survey site (assets/readiness.js) without its renderer. Runs only in the browser or in tests.
   Nothing is stored or sent anywhere. The content and the rules live in assets/readiness.json. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Readiness = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Answers that count as "not in place in time" for the readiness grid (question 8) ...
  const GAP = ['Ready after Oct 8', 'Still not ready'];
  // ... and as "unclear" for the expectations grid (question 5).
  const LOW = ['1', '2', 'I do not recall'];

  const val = (a, k) => (a && a[k] !== undefined && a[k] !== null) ? String(a[k]) : '';

  function cond(c, a) {
    if (!c) return false;
    if (c.any) return c.any.some(x => cond(x, a));
    if (c.all) return c.all.every(x => cond(x, a));
    if (c.gap) return GAP.includes(val(a, c.gap));
    if (c.low) return LOW.includes(val(a, c.low));
    if (c.key && c.in) return c.in.includes(val(a, c.key));
    if (c.key && c.has) return val(a, c.key).split(' | ').includes(c.has);
    return false;
  }
  const matches = (item, a) => cond(item.when || item, a);

  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

  // Pure function: content + answers + today's date -> what to show.
  function build(content, a, today) {
    const day = ymd(today || new Date());
    const hit = content.now.filter(i => matches(i, a));
    const ids = new Set(hit.map(i => i.id));
    const shown = hit.filter(i => !(i.unless || []).some(u => ids.has(u)));
    const by = lvl => shown.filter(i => i.level === lvl);
    const chosen = val(a, 'q19').split(' | ');   // question 19: up to two resources the sponsor picked
    const kit = content.kit
      .map((k, idx) => Object.assign({}, k, { idx, picked: (k.picks || []).some(p => chosen.includes(p)) }))
      .sort((x, y) => Number(y.picked) - Number(x.picked) || x.idx - y.idx)
      .map(k => Object.assign(k, { top: k.picked }));
    return {
      fix: by('fix'), refresh: by('refresh'), info: by('info'),
      dates: content.dates.filter(d => d.until >= day),
      kit,
      contacts: content.contacts
    };
  }

  /* ---------- reopenable link ----------
     A sponsor's answers are turned into short option codes, such as "5-0123-1" for question 5.
     The codes go after the # in the kit site's address, which a browser never sends to any server.
     No names, emails or free text are included. */
  // The link format version, the same as in the survey's readiness.js. Links with an older version (1_ until
  // Nov 2026) were made against different questions, so they are not decoded; the page says they are out of date.
  const VERSION = '2_';
  const CODED = q => q.n && q.type !== 'text' && q.type !== 'contact';

  function encode(questions, a) {
    const parts = [];
    (questions || []).filter(CODED).forEach(q => {
      const k = 'q' + q.n; let v = '';
      if (q.type === 'single') { const i = q.options.findIndex(o => o.label === val(a, k)); if (i >= 0) v = String(i); }
      else if (q.type === 'multi') v = val(a, k).split(' | ').map(l => q.options.findIndex(o => o.label === l)).filter(i => i >= 0).join('.');
      else if (q.type === 'scale') { const s = val(a, k); if (/^[1-5]$/.test(s)) v = s; else { const i = (q.extra || []).indexOf(s); if (i >= 0) v = 'x' + i; } }
      else if (q.type === 'grid') { const g = q.rows.map((_, i) => { const j = q.cols.indexOf(val(a, k + '_r' + (i + 1))); return j >= 0 ? String(j) : '-'; }).join(''); if (/\d/.test(g)) v = g; }
      if (v !== '') parts.push(q.n + '-' + v);
    });
    return VERSION + parts.join('_');
  }

  // Never throws: anything that does not fit the survey is ignored, so a damaged link just gives a shorter kit.
  function decode(questions, code) {
    const out = {}, s = String(code || '');
    if (s.slice(0, VERSION.length) !== VERSION) return out;
    s.slice(2).split('_').forEach(p => {
      const at = p.indexOf('-'); if (at < 1) return;
      const q = (questions || []).filter(CODED).find(x => String(x.n) === p.slice(0, at)); if (!q) return;
      const v = p.slice(at + 1), k = 'q' + q.n;
      if (q.type === 'single') { const o = q.options[+v]; if (/^\d+$/.test(v) && o) out[k] = o.label; }
      else if (q.type === 'multi') { const l = v.split('.').filter(x => /^\d+$/.test(x) && q.options[+x]).map(x => q.options[+x].label); if (l.length) out[k] = l.join(' | '); }
      else if (q.type === 'scale') { if (/^[1-5]$/.test(v)) out[k] = v; else if (/^x\d+$/.test(v) && (q.extra || [])[+v.slice(1)]) out[k] = q.extra[+v.slice(1)]; }
      else if (q.type === 'grid') v.split('').slice(0, q.rows.length).forEach((c, i) => { if (/\d/.test(c) && q.cols[+c]) out[k + '_r' + (i + 1)] = q.cols[+c]; });
    });
    return out;
  }

  return { GAP, LOW, VERSION, matches, build, encode, decode };
});
