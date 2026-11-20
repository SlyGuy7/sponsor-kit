/* Builds a sponsor's readiness kit from the option codes after the # in the address.
   The codes never leave this page. The page reads two files from its own site and sends nothing.
   Ticks and a few display choices are kept in this browser's localStorage only. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const MISSING = 'This kit link is missing or damaged, so there is nothing to build. Take the survey and your kit will appear when you finish.';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86400000;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, attrs) {
  const e = document.createElement(tag);
  Object.keys(attrs || {}).forEach(k => { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
  const add = c => { if (Array.isArray(c)) c.forEach(add); else if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); };
  for (let i = 2; i < arguments.length; i++) add(arguments[i]);
  return e;
}
const paras = t => String(t || '').split('\n\n').filter(Boolean).map(p => el('p', { text: p }));
const bullets = items => items && items.length ? el('ul', null, items.map(s => el('li', { text: s }))) : null;
const src = s => s ? el('p', { class: 'src', text: 'Source: ' + s }) : null;
const plural = (n, one, many) => n === 1 ? one : many;

/* ---------- browser storage (every access can fail in private mode, so each is guarded) ---------- */
const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* kept for this visit only */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* nothing to clear */ } }
};
let CODE = '';
const K = { ticks: () => 'sponsor-kit-ticks:' + CODE, seen: () => 'sponsor-kit-seen:' + CODE, hide: 'sponsor-kit-hide-done', theme: 'njit-sponsor-theme' };
const loadTicks = () => store.get(K.ticks(), {}) || {};

/* ---------- dates ---------- */
const parse = ymd => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); };
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysUntil = (ymd, today) => Math.round((parse(ymd) - midnight(today)) / DAY);
const countdown = n => n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : 'In ' + n + ' days';

/* ---------- toast, copy, download ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2800);
}
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise((ok, no) => {
    const ta = el('textarea', { class: 'vh', readonly: '' }); ta.value = text;
    document.body.append(ta); ta.select();
    const done = document.execCommand('copy'); ta.remove();
    if (done) ok(); else no(new Error('copy failed'));
  });
}
const copy = (text, msg) => copyText(text).then(() => toast(msg), () => toast('Could not copy. Select the text and copy it instead.'));
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A calendar file (RFC 5545) with each date as an all-day event on its last day.
function icsFile(dates) {
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = line => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
  const ymd = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NJIT YWCC Capstone//Sponsor readiness kit//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Capstone sponsor dates'];
  dates.forEach(d => {
    const start = parse(d.until), end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    lines.push('BEGIN:VEVENT',
      'UID:' + d.until + '-' + d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '@sponsor-kit',
      'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + ymd(start), 'DTEND;VALUE=DATE:' + ymd(end),
      'SUMMARY:' + esc('Capstone: ' + d.title),
      'DESCRIPTION:' + esc(d.when + '. ' + d.detail),
      'TRANSP:TRANSPARENT', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- plain-text versions, for email and copying ---------- */
function itemText(item) {
  const out = [item.title, ''];
  if (item.intro) out.push(item.intro, '');
  String(item.body || '').split('\n\n').filter(Boolean).forEach(p => out.push(p, ''));
  if (item.steps && item.steps.length) out.push(...item.steps.map(s => '- ' + s), '');
  if (item.timeline) out.push(...item.timeline.map(t => t.when + ': ' + t.what), '');
  if (item.template) item.template.forEach(t => out.push(t.h, t.p, ''));
  if (item.sample) out.push(item.sample, '');
  if (item.source) out.push('Source: ' + item.source);
  return out.join('\n').trim();
}
// A ready-to-send email about one action. No recipient is filled in: the kit never knows the PM's address.
const mailto = item => 'mailto:?subject=' + encodeURIComponent('Capstone: ' + item.title) +
  '&body=' + encodeURIComponent(itemText(item) + '\n\nFrom my sponsor readiness kit: ' + location.href);

function actionListText(prio) {
  const t = loadTicks();
  const lines = ['My Capstone readiness actions', ''];
  prio.forEach((i, n) => {
    const tasks = i.steps && i.steps.length ? i.steps : ['Done'], done = new Set(t[i.id] || []);
    lines.push((n + 1) + '. ' + i.title + (done.size === tasks.length ? ' (done)' : ''));
    tasks.forEach((s, j) => lines.push('   ' + (done.has(j) ? '[x] ' : '[ ] ') + s));
    lines.push('');
  });
  lines.push('Kit: ' + location.href);
  return lines.join('\n');
}

/* ---------- what changed since the last visit (content only, never answers) ---------- */
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
function fingerprint(r, prio) {
  const f = {};
  prio.forEach(i => { f['act:' + i.id] = hash(JSON.stringify([i.title, i.body, i.steps])); });
  r.dates.forEach(d => { f['date:' + d.title] = hash(JSON.stringify([d.until, d.when, d.detail])); });
  r.kit.forEach(k => { f['kit:' + k.id] = hash(JSON.stringify(k)); });
  return f;
}
function whatsNew(r, prio) {
  const now = fingerprint(r, prio), before = store.get(K.seen(), null);
  if (!before) { store.set(K.seen(), now); return; }
  const mark = target => { if (target) target.after(el('span', { class: 'upd', text: 'Updated' })); };
  const names = [];
  Object.keys(now).filter(k => before[k] !== now[k]).forEach(k => {
    const kind = k.slice(0, k.indexOf(':')), id = k.slice(k.indexOf(':') + 1);
    if (kind === 'act') { const s = $('.step[data-id="' + id + '"] h3'); if (s) { mark(s); names.push(s.textContent); } }
    if (kind === 'date') { const t = $$('#dateList .t').find(x => x.textContent === id); if (t) { mark(t); names.push(id); } }
    if (kind === 'kit') { const s = $('#nextList details[data-id="' + id + '"] .sum-t'); if (s) { mark(s); names.push(s.textContent); } }
  });
  if (!names.length) { store.set(K.seen(), now); return; }
  $('#newCount').textContent = names.length === 1 ? 'One item has changed since your last visit:' : names.length + ' items have changed since your last visit:';
  $('#newList').append(...names.map(n => el('li', { text: n })));
  $('#whatsNew').hidden = false;
  $('#gotIt').addEventListener('click', () => {
    store.set(K.seen(), now);
    $('#whatsNew').hidden = true;
    $$('.upd').forEach(u => u.remove());
    $('#hActions').focus({ preventScroll: true });
  });
}

/* ---------- QR code for the printout (drawn by assets/qr.js, nothing fetched) ---------- */
function qrSvg(text) {
  const NS = 'http://www.w3.org/2000/svg', m = QR.encode(text), n = m.length, q = 4;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code that opens this kit');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', String(n + 2 * q)); bg.setAttribute('height', String(n + 2 * q)); bg.setAttribute('fill', '#fff');
  let d = '';
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z'; }));
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', '#000');
  svg.append(bg, path);
  return svg;
}

// In the two days before the Showcase, a banner at the top with when and where.
function eventBanner(r, today) {
  const ev = r.dates.find(d => /showcase/i.test(d.title) && !/prep/i.test(d.title));
  if (!ev) return;
  const left = daysUntil(ev.until, today);
  if (left < 0 || left > 2) return;
  $('#eventWhen').textContent = left === 0 ? 'Today' : left === 1 ? 'Tomorrow' : 'In 2 days';
  $('#eventTitle').textContent = ev.title;
  $('#eventTime').textContent = ev.when;
  $('#eventDetail').textContent = ev.detail;
  $('#eventIcs').setAttribute('aria-label', 'Add to calendar: ' + ev.title);
  $('#eventIcs').addEventListener('click', () => { download('capstone-' + slug(ev.title) + '.ics', icsFile([ev])); toast('Calendar file downloaded. Open it to add "' + ev.title + '".'); });
  $('#event').hidden = false;
}

/* ---------- rendering ---------- */
function contactRows(contacts) {
  return contacts.map(c => el('li', null,
    el('div', { class: 'who' }, el('b', { text: c.who })),
    el('p', { class: 'for', text: c.for }),
    c.email ? el('div', { class: 'mail-row' },
      el('a', { class: 'mail', href: 'mailto:' + c.email, text: c.email }),
      el('button', { class: 'mini-btn', type: 'button', 'data-copy': c.email, 'aria-label': 'Copy ' + c.email }, 'Copy')) : null));
}

function detail(item) {
  return [
    item.intro ? el('p', { text: item.intro }) : null,
    paras(item.body), bullets(item.steps),
    item.timeline ? el('ol', { class: 'tl' }, item.timeline.map(t => el('li', null, el('b', { text: t.when }), el('span', { text: t.what })))) : null,
    item.template ? el('dl', null, item.template.map(t => [el('dt', { text: t.h }), el('dd', { text: t.p })])) : null,
    item.sample ? el('blockquote', { text: item.sample }) : null
  ];
}

// One numbered step: the advice, then its steps as tick boxes (or one "done" box if it has none).
function step(item, ticks, n) {
  const tasks = item.steps && item.steps.length ? item.steps : ['Done'];
  const done = new Set(ticks[item.id] || []);
  const boxes = tasks.map((t, i) => {
    const id = 'c-' + item.id + '-' + i;
    const box = el('input', { type: 'checkbox', id, 'data-item': item.id, 'data-i': String(i) });
    box.checked = done.has(i);
    return el('li', null, box, el('label', { for: id, text: t }));
  });
  return el('li', { class: 'step', 'data-id': item.id, 'data-n': String(n), 'data-level': item.level },
    el('div', { class: 'step-h' }, el('h3', { text: item.title }), el('span', { class: 'status' })),
    paras(item.body),
    el('ul', { class: 'checks', 'aria-label': 'Steps for: ' + item.title }, boxes),
    el('div', { class: 'step-f' }, src(item.source),
      el('a', { class: 'mini', href: mailto(item), 'aria-label': 'Email this to my PM: ' + item.title }, 'Email this to my PM')));
}

const hideDone = () => store.get(K.hide, false) === true;
function refreshProgress() {
  const all = $$('.checks input'), on = all.filter(b => b.checked).length;
  $('#progNum').textContent = on + ' of ' + all.length;
  $('#progTxt').textContent = plural(all.length, 'step done', 'steps done');
  $('#progBar').value = all.length ? Math.round(on / all.length * 100) : 0;
  $('#progBar').setAttribute('aria-valuetext', on + ' of ' + all.length + ' steps done');
  $$('.step').forEach(s => {
    const b = [...s.querySelectorAll('.checks input')], n = b.filter(x => x.checked).length;
    const st = n === b.length ? 'done' : n ? 'doing' : 'todo';
    s.dataset.status = st;
    s.querySelector('.status').textContent = { done: 'Done', doing: 'In progress', todo: 'To do' }[st];
  });
  const finished = $$('.step[data-status="done"]').length, steps = $$('.step').length;
  $('#actions').classList.toggle('hide-done', hideDone());
  $('#hideDone').setAttribute('aria-pressed', String(hideDone()));
  $('#hideDone').textContent = 'Hide finished' + (finished ? ' (' + finished + ')' : '');
  $('#allDone').hidden = !(steps && finished === steps);
  $('#clearTicks').disabled = !on;
}

function render(r, today) {
  const prio = [...r.fix, ...r.refresh, ...r.info], top = prio.slice(0, 3), rest = prio.slice(3);
  const ticks = loadTicks();

  /* priority actions */
  top.forEach((i, n) => $('#acts').append(step(i, ticks, n + 1)));
  if (rest.length) {
    $('#moreSum').textContent = 'More for this semester (' + rest.length + ')';
    rest.forEach((i, n) => $('#more').append(step(i, ticks, top.length + n + 1)));
    $('#moreWrap').hidden = false;
  }
  $('#subActions').textContent = r.fix.length
    ? 'What your responses point to most, in order. Tick each step as you finish it.' + (prio.length > 3 ? ' ' + prio.length + ' in total; the rest are under "More for this semester".' : '')
    : 'Nothing urgent stands out in your responses. Here is what is most useful now.';
  $('#kit').addEventListener('change', e => {
    const b = e.target;
    if (!b.matches('.checks input')) return;
    const t = loadTicks(), id = b.dataset.item, i = Number(b.dataset.i);
    const s = new Set(t[id] || []); if (b.checked) s.add(i); else s.delete(i);
    if (s.size) t[id] = [...s].sort(); else delete t[id];
    store.set(K.ticks(), t);
    if (b.checked && !reduced()) { const row = b.closest('li'); row.classList.remove('pop'); void row.offsetWidth; row.classList.add('pop'); }
    refreshProgress();
    if (b.checked && b.closest('.step').dataset.status === 'done') toast('"' + b.closest('.step').querySelector('h3').textContent + '" is done.');
  });
  $('#hideDone').addEventListener('click', () => { store.set(K.hide, !hideDone()); refreshProgress(); });
  $('#copyList').addEventListener('click', () => copy(actionListText(prio), 'Action list copied. Paste it into an email, Teams or your notes.'));
  $('#clearTicks').addEventListener('click', () => {
    if (!confirm('Clear every tick in this kit? This cannot be undone.')) return;
    store.del(K.ticks());
    $$('.checks input').forEach(b => { b.checked = false; });
    refreshProgress();
    toast('All ticks cleared.');
  });

  /* key dates */
  if (r.dates.length) {
    r.dates.forEach((d, n) => {
      const day = parse(d.until), left = daysUntil(d.until, today);
      const add = el('button', { class: 'mini-btn', type: 'button', 'aria-label': 'Add to calendar: ' + d.title }, 'Add to calendar');
      add.addEventListener('click', () => { download('capstone-' + slug(d.title) + '.ics', icsFile([d])); toast('Calendar file downloaded. Open it to add "' + d.title + '".'); });
      $('#dateList').append(el('li', { class: (n === 0 ? 'next' : '') + (left <= 7 ? ' soon' : '') },
        el('div', { class: 'cal', 'aria-hidden': 'true' }, el('span', { class: 'm', text: MONTHS[day.getMonth()] }), el('span', { class: 'd', text: String(day.getDate()) })),
        el('div', { class: 'dt' },
          el('div', { class: 'dt-h' }, el('span', { class: 't', text: d.title }), el('span', { class: 'left', text: countdown(left) })),
          el('span', { class: 'when', text: d.when }),
          el('span', { class: 'd', text: d.detail }),
          el('div', { class: 'dt-f' }, add))));
    });
    $('#nextWhen').textContent = countdown(daysUntil(r.dates[0].until, today));
    $('#nextWhat').textContent = r.dates[0].title;
  } else {
    $('#dateList').hidden = true; $('#noDates').hidden = false; $('#ics').hidden = true;
    $('#nextWhen').textContent = 'None'; $('#nextWhat').textContent = 'This semester\'s dates have passed';
  }
  $('#ics').addEventListener('click', () => { download('capstone-sponsor-dates.ics', icsFile(r.dates)); toast('Calendar file downloaded. Open it to add the dates.'); });

  $('#fixNum').textContent = String(r.fix.length);
  $('#fixTxt').textContent = r.fix.length ? plural(r.fix.length, 'item from your answers', 'items from your answers') : 'Nothing urgent';

  /* contacts */
  $('#contactList').append(...contactRows(r.contacts));

  /* next project */
  r.kit.forEach(k => {
    const cp = el('button', { class: 'mini-btn', type: 'button', 'aria-label': 'Copy text: ' + k.title }, 'Copy text');
    cp.addEventListener('click', () => copy(itemText(k), '"' + k.title + '" copied as text.'));
    const d = el('details', { class: 'item', 'data-id': k.id },
      el('summary', null, el('span', { class: 'sum-t', text: k.title }), k.picked ? el('span', { class: 'tag', text: 'You picked this' }) : null),
      el('div', { class: 'item-b' }, detail(k), k.contacts ? el('ul', { class: 'people small' }, contactRows(r.contacts)) : null,
        el('div', { class: 'step-f' }, src(k.source), cp)));
    if (k.picked) d.open = true;
    $('#nextList').append(d);
  });
  const syncToggle = () => { const all = $$('#nextList details').every(d => d.open); $('#toggleAll').textContent = all ? 'Collapse all' : 'Expand all'; $('#toggleAll').setAttribute('aria-expanded', String(all)); };
  $('#toggleAll').addEventListener('click', () => { const open = !$$('#nextList details').every(d => d.open); $$('#nextList details').forEach(d => { d.open = open; }); syncToggle(); });
  $('#nextList').addEventListener('toggle', syncToggle, true);
  syncToggle();

  /* copy buttons on contact emails, wherever they appear */
  $('#kit').addEventListener('click', e => { const b = e.target.closest('[data-copy]'); if (b) copy(b.dataset.copy, b.dataset.copy + ' copied.'); });

  $('#lede').textContent = 'Prepared from your survey responses and the Capstone Sponsor Guide: what to act on first, the dates still ahead, and who to contact.';
  $('#printed').textContent = 'Prepared ' + today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '. Scan the code, or open ' + location.href + ', to reopen this kit.';
  try { $('#printQr').append(qrSvg(location.href)); } catch (e) { /* link too long for a code: the printed address still works */ }
  refreshProgress();
  whatsNew(r, prio);
  eventBanner(r, today);
  ['#kit', '#side', '#sum', '#print', canShare() ? '#share' : '#copy'].forEach(s => { $(s).hidden = false; });
}

function fail(msg) { $('.hero').classList.add('full'); $('#lede').hidden = true; $('#err').textContent = msg; $('#err').hidden = false; $('#again').hidden = false; }

async function load(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }

function sideNav() {
  const links = $$('.side a');
  const secs = links.map(a => document.getElementById(a.getAttribute('href').slice(1)));
  const mark = id => links.forEach(a => { if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  const go = sec => { sec.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); sec.querySelector('h2, h1').focus({ preventScroll: true }); };
  mark('actions');
  // Scroll without touching the address, so the #kit= link survives for reloading, bookmarking or sharing.
  links.forEach((a, n) => a.addEventListener('click', e => { e.preventDefault(); go(secs[n]); mark(secs[n].id); }));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { const v = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) mark(v.target.id); }, { rootMargin: '0px 0px -60% 0px' });
    secs.forEach(s => io.observe(s));
    // "Back to top" appears once the header has scrolled away.
    new IntersectionObserver(([e]) => { $('#toTop').classList.toggle('on', !e.isIntersecting); }).observe($('.hero'));
  }
  $('#toTop').addEventListener('click', () => { scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); $('h1').focus({ preventScroll: true }); });
}

async function boot() {
  const m = /^#kit=(1_[0-9a-zx._-]*)$/.exec(location.hash);
  if (!m) return fail(MISSING);
  try {
    const [survey, content] = await Promise.all([load('assets/survey.json'), load('assets/readiness.json')]);
    const answers = Readiness.decode(survey.questions, m[1]);
    if (!Object.keys(answers).length) return fail(MISSING);
    CODE = m[1];
    const today = new Date();
    render(Readiness.build(content, answers, today), today);
    sideNav();
  } catch (e) { fail('The kit could not be loaded. Please check your connection and reload this page.'); }
}

$('#print').addEventListener('click', () => {
  const closed = $$('details:not([open])');
  closed.forEach(d => { d.open = true; });
  const undo = () => { closed.forEach(d => { d.open = false; }); removeEventListener('afterprint', undo); };
  addEventListener('afterprint', undo);
  window.print();
});
$('#copy').addEventListener('click', () => copy(location.href, 'Link copied. It holds no names or emails, so it is safe to share.'));
// On phones and tablets, Share opens the device's own share sheet (Messages, WhatsApp, Teams...) in place of Copy link.
const canShare = () => typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;
$('#share').addEventListener('click', () => {
  navigator.share({ title: 'My sponsor readiness kit', text: 'My NJIT Capstone sponsor readiness kit', url: location.href })
    .catch(e => { if (e && e.name !== 'AbortError') copy(location.href, 'Sharing is not available, so the link was copied instead.'); });
});

// Light or dark: the button overrides the system setting and remembers the choice.
// The key is shared with the survey site (same origin), so one choice can cover both.
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const theme = () => document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light');
const syncTheme = () => $('#theme').setAttribute('aria-pressed', String(theme() === 'dark'));
$('#theme').addEventListener('click', () => {
  const next = theme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(K.theme, next); } catch (e) { /* not remembered, still switched */ }
  syncTheme();
});
darkQuery.addEventListener('change', syncTheme);
syncTheme();

// A different kit link pasted into the address bar: build that kit instead.
addEventListener('hashchange', () => { if (location.hash.startsWith('#kit=')) location.reload(); });
boot();
})();
