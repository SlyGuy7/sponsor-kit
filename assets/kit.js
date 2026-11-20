/* Builds a sponsor's readiness kit from the option codes after the # in the address.
   The codes never leave this page. The page reads two files from its own site and sends nothing.
   Ticked steps are kept in this browser's localStorage only. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const MISSING = 'This kit link is missing or damaged, so there is nothing to build. Take the survey and your kit will appear when you finish.';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 86400000;

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

/* ---------- dates ---------- */
const parse = ymd => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); };
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysUntil = (ymd, today) => Math.round((parse(ymd) - midnight(today)) / DAY);
const countdown = n => n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : 'In ' + n + ' days';

/* ---------- ticked steps, kept only in this browser ---------- */
let STORE_KEY = '';
function loadTicks() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { return {}; } }
function saveTicks(t) { try { localStorage.setItem(STORE_KEY, JSON.stringify(t)); } catch (e) { /* private mode: ticks last until the tab closes */ } }

/* ---------- small helpers ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
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

/* ---------- rendering ---------- */
function contactRows(contacts) {
  return contacts.map(c => el('li', null,
    el('div', { class: 'who' }, el('b', { text: c.who })),
    el('p', { class: 'for', text: c.for }),
    c.email ? el('a', { class: 'mail', href: 'mailto:' + c.email, text: c.email }) : null));
}

function detail(item) {
  return [
    item.intro ? el('p', { text: item.intro }) : null,
    paras(item.body), bullets(item.steps),
    item.timeline ? el('ol', { class: 'tl' }, item.timeline.map(t => el('li', null, el('b', { text: t.when }), el('span', { text: t.what })))) : null,
    item.template ? el('dl', null, item.template.map(t => [el('dt', { text: t.h }), el('dd', { text: t.p })])) : null,
    item.sample ? el('blockquote', { text: item.sample }) : null,
    src(item.source)
  ];
}

// One numbered step: the advice, then its steps as tick boxes (or one "done" box if it has none).
function step(item, ticks, n) {
  const tasks = item.steps && item.steps.length ? item.steps : ['Done'];
  const done = new Set(ticks[item.id] || []);
  const status = el('span', { class: 'status' });
  const boxes = tasks.map((t, i) => {
    const id = 'c-' + item.id + '-' + i;
    const box = el('input', { type: 'checkbox', id, 'data-item': item.id, 'data-i': String(i) });
    box.checked = done.has(i);
    return el('li', null, box, el('label', { for: id, text: t }));
  });
  const li = el('li', { class: 'step', 'data-id': item.id, 'data-n': String(n), 'data-level': item.level },
    el('div', { class: 'step-h' }, el('h3', { text: item.title }), status),
    paras(item.body),
    el('ul', { class: 'checks', 'aria-label': 'Steps for: ' + item.title }, boxes),
    src(item.source));
  return li;
}

function refreshProgress() {
  const all = [...document.querySelectorAll('.checks input')];
  const on = all.filter(b => b.checked).length;
  $('#progNum').textContent = on + ' of ' + all.length;
  $('#progTxt').textContent = plural(all.length, 'step done', 'steps done');
  $('#progBar').value = all.length ? Math.round(on / all.length * 100) : 0;
  $('#progBar').setAttribute('aria-valuetext', on + ' of ' + all.length + ' steps done');
  document.querySelectorAll('.step').forEach(s => {
    const b = [...s.querySelectorAll('.checks input')], n = b.filter(x => x.checked).length;
    const st = n === b.length ? 'done' : n ? 'doing' : 'todo';
    s.dataset.status = st;
    s.querySelector('.status').textContent = { done: 'Done', doing: 'In progress', todo: 'To do' }[st];
  });
}

function render(r, today) {
  const prio = [...r.fix, ...r.refresh, ...r.info], top = prio.slice(0, 3), rest = prio.slice(3);
  const ticks = loadTicks();

  top.forEach((i, n) => $('#acts').append(step(i, ticks, n + 1)));
  if (rest.length) {
    $('#moreSum').textContent = 'More for this semester (' + rest.length + ')';
    $('#more').setAttribute('start', String(top.length + 1));
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
    saveTicks(t);
    refreshProgress();
  });

  // Dates, with a countdown on each.
  if (r.dates.length) {
    r.dates.forEach((d, n) => {
      const day = parse(d.until), left = daysUntil(d.until, today);
      $('#dateList').append(el('li', { class: n === 0 ? 'next' : '' },
        el('div', { class: 'cal', 'aria-hidden': 'true' }, el('span', { class: 'm', text: MONTHS[day.getMonth()] }), el('span', { class: 'd', text: String(day.getDate()) })),
        el('div', { class: 'dt' },
          el('div', { class: 'dt-h' }, el('span', { class: 't', text: d.title }), el('span', { class: 'left', text: countdown(left) })),
          el('span', { class: 'when', text: d.when }),
          el('span', { class: 'd', text: d.detail }))));
    });
    const first = r.dates[0];
    $('#nextWhen').textContent = countdown(daysUntil(first.until, today));
    $('#nextWhat').textContent = first.title;
  } else {
    $('#dateList').hidden = true; $('#noDates').hidden = false; $('#ics').hidden = true;
    $('#nextWhen').textContent = 'None'; $('#nextWhat').textContent = 'This semester\'s dates have passed';
  }
  $('#ics').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([icsFile(r.dates)], { type: 'text/calendar;charset=utf-8' }));
    const a = el('a', { href: url, download: 'capstone-sponsor-dates.ics' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Calendar file downloaded. Open it to add the dates.');
  });

  $('#fixNum').textContent = String(r.fix.length);
  $('#fixTxt').textContent = r.fix.length ? plural(r.fix.length, 'item from your answers', 'items from your answers') : 'Nothing urgent';

  $('#contactList').append(...contactRows(r.contacts));

  r.kit.forEach(k => {
    const d = el('details', { class: 'item' },
      el('summary', null, el('span', { class: 'sum-t', text: k.title }), k.picked ? el('span', { class: 'tag', text: 'You picked this' }) : null),
      el('div', { class: 'item-b' }, detail(k), k.contacts ? el('ul', { class: 'people small' }, contactRows(r.contacts)) : null));
    if (k.picked) d.open = true;
    $('#nextList').append(d);
  });

  $('#lede').textContent = 'Prepared from your survey responses and the Capstone Sponsor Guide: what to act on first, the dates still ahead, and who to contact.';
  $('#printed').textContent = 'Prepared ' + today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '. Reopen this kit at ' + location.href;
  refreshProgress();
  ['#kit', '#side', '#sum', '#print', '#copy'].forEach(s => { $(s).hidden = false; });
}

function fail(msg) { $('.hero').classList.add('full'); $('#lede').hidden = true; $('#err').textContent = msg; $('#err').hidden = false; $('#again').hidden = false; }

async function load(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }

function sideNav() {
  const links = [...document.querySelectorAll('.side a')];
  const secs = links.map(a => document.getElementById(a.getAttribute('href').slice(1)));
  const mark = id => links.forEach(a => { if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  mark('actions');
  // Scroll without touching the address, so the #kit= link survives for reloading, bookmarking or sharing.
  links.forEach((a, n) => a.addEventListener('click', e => {
    e.preventDefault();
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    secs[n].scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    secs[n].querySelector('h2').focus({ preventScroll: true });
    mark(secs[n].id);
  }));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { const v = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (v) mark(v.target.id); }, { rootMargin: '0px 0px -60% 0px' });
    secs.forEach(s => io.observe(s));
  }
}

async function boot() {
  const m = /^#kit=(1_[0-9a-zx._-]*)$/.exec(location.hash);
  if (!m) return fail(MISSING);
  try {
    const [survey, content] = await Promise.all([load('assets/survey.json'), load('assets/readiness.json')]);
    const answers = Readiness.decode(survey.questions, m[1]);
    if (!Object.keys(answers).length) return fail(MISSING);
    STORE_KEY = 'sponsor-kit-ticks:' + m[1];
    const today = new Date();
    render(Readiness.build(content, answers, today), today);
    sideNav();
  } catch (e) { fail('The kit could not be loaded. Please check your connection and reload this page.'); }
}

$('#print').addEventListener('click', () => {
  const closed = [...document.querySelectorAll('details:not([open])')];
  closed.forEach(d => { d.open = true; });
  const undo = () => { closed.forEach(d => { d.open = false; }); removeEventListener('afterprint', undo); };
  addEventListener('afterprint', undo);
  window.print();
});
$('#copy').addEventListener('click', () => {
  copyText(location.href).then(() => toast('Link copied. It holds no names or emails, so it is safe to share.'), () => toast('Could not copy. Copy the address from the address bar instead.'));
});
// Light or dark: the button overrides the system setting and remembers the choice in this browser.
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const theme = () => document.documentElement.dataset.theme || (darkQuery.matches ? 'dark' : 'light');
const syncTheme = () => $('#theme').setAttribute('aria-pressed', String(theme() === 'dark'));
$('#theme').addEventListener('click', () => {
  const next = theme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('sponsor-kit-theme', next); } catch (e) { /* not remembered, still switched */ }
  syncTheme();
});
darkQuery.addEventListener('change', syncTheme);
syncTheme();
// A different kit link pasted into the address bar: build that kit instead.
addEventListener('hashchange', () => { if (location.hash.startsWith('#kit=')) location.reload(); });
boot();
})();
