/* Builds a sponsor's readiness kit from the option codes after the # in the address.
   The codes never leave this page. The page reads two files from its own site and sends nothing. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const SURVEY = 'https://slyguy7.github.io/sponsor-survey/';
const MISSING = 'This kit link is missing or damaged, so there is nothing to build. Take the survey and your kit will appear when you finish.';

const ICONS = {
  doc: '<path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4zM8 9h8M8 12h5"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-4 3-6 7-6s7 2 7 6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01"/>',
  data: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M14 9l2 2"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  alert: '<path d="M12 4l9 16H3zM12 10v4M12 17h.01"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'
};
const ICON_FOR = {
  'gap-goals': 'target', 'gap-scope-doc': 'doc', 'gap-requirements': 'list', 'gap-data': 'data', 'gap-access': 'key',
  'gap-decider': 'person', 'gap-contact': 'person', 'gap-nda': 'shield', 'blocked-now': 'alert', 'scope-undocumented': 'doc',
  'rhythm-gap': 'calendar', 'help-gap': 'chat', 'unhappy-start': 'chat',
  'rf-weekly': 'calendar', 'rf-feedback': 'chat', 'rf-scope': 'doc', 'rf-stretch': 'target', 'rf-concerns': 'chat',
  'rf-events': 'calendar', 'rf-eval': 'list', 'guide-missing': 'doc', 'scope-unsure': 'doc', 'rhythm-light': 'calendar',
  'next-easier': 'chat'
};

function el(tag, attrs) {
  const e = document.createElement(tag);
  Object.keys(attrs || {}).forEach(k => { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
  const add = c => { if (Array.isArray(c)) c.forEach(add); else if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); };
  for (let i = 2; i < arguments.length; i++) add(arguments[i]);
  return e;
}
const paras = t => String(t || '').split('\n\n').map(p => el('p', { text: p }));
const bullets = items => items && items.length ? el('ul', null, items.map(s => el('li', { text: s }))) : null;
const src = s => s ? el('p', { class: 'src', text: 'Source: ' + s }) : null;
function icon(id) {
  const wrap = el('span', { class: 'ic', 'aria-hidden': 'true' });
  wrap.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + (ICONS[ICON_FOR[id]] || ICONS.check) + '</svg>';   // constant markup, never user text
  return wrap;
}
function contactList(contacts) {
  return contacts.map(c => el('li', null, el('b', { text: c.who + '. ' }), c.for, c.email ? [' ', el('a', { href: 'mailto:' + c.email, text: c.email })] : null));
}
function detail(item) {
  return [
    item.intro ? el('p', { text: item.intro }) : null,
    paras(item.body), bullets(item.steps),
    item.timeline ? el('ol', null, item.timeline.map(t => el('li', null, el('b', { text: t.when }), ' ', t.what))) : null,
    item.template ? el('dl', null, item.template.map(t => [el('dt', { text: t.h }), el('dd', { text: t.p })])) : null,
    item.sample ? el('blockquote', { text: item.sample }) : null,
    src(item.source)
  ];
}

function render(r) {
  const prio = [...r.fix, ...r.refresh, ...r.info], top = prio.slice(0, 3), rest = prio.slice(3);
  $('#sum').append(
    el('div', null, el('b', { text: String(r.fix.length) }), el('span', { text: r.fix.length === 1 ? 'item needs attention' : 'items need attention' })),
    el('div', null, el('b', { text: String(r.dates.length) }), el('span', { text: r.dates.length === 1 ? 'date ahead' : 'dates ahead' })),
    el('div', null, el('b', { text: String(r.kit.length) }), el('span', { text: 'reference guides' })));
  $('#subActions').textContent = r.fix.length
    ? 'The items your responses point to most' + (prio.length > 3 ? ' (' + prio.length + ' in total; the rest are below).' : '.')
    : 'Nothing urgent stands out in your responses. Here is what is most useful now.';
  top.forEach(i => $('#acts').append(el('article', { class: 'act' }, icon(i.id), el('div', null, el('h3', { text: i.title }), detail(i)))));
  if (rest.length) {
    $('#moreSum').textContent = 'More for this semester (' + rest.length + ')';
    rest.forEach(i => $('#more').append(el('div', { class: 'block' }, el('h3', { text: i.title }), detail(i))));
    $('#moreWrap').hidden = false;
  }
  if (r.dates.length) r.dates.forEach((d, n) => $('#dateList').append(el('li', { class: n === 0 ? 'next' : '' }, el('b', { text: d.when }), el('span', null, el('span', { class: 't', text: d.title }), el('span', { class: 'd', text: d.detail })))));
  else { $('#dateList').hidden = true; $('#noDates').hidden = false; }
  $('#contactList').append(...contactList(r.contacts));
  if (r.delivery) {
    $('#delivery').textContent = 'Noted: you would prefer to receive it as "' + r.delivery.charAt(0).toLowerCase() + r.delivery.slice(1) + '".';
    $('#delivery').hidden = false;
  }
  r.kit.forEach(k => {
    const d = el('details', { class: 'item' }, el('summary', null, k.title, k.picked ? el('span', { class: 'tag', text: 'You picked this' }) : null), el('div', null, detail(k), k.contacts ? el('ul', null, contactList(r.contacts)) : null));
    if (k.picked) d.open = true;
    $('#nextList').append(d);
  });
  $('#lede').textContent = 'Prepared from your survey responses and the Capstone Sponsor Guide. It lists what to act on first, the dates still ahead, and who to contact.';
  $('#printed').textContent = 'Prepared ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '. Reopen this kit at ' + location.href;
  $('#kit').hidden = false; $('#side').hidden = false; $('#print').hidden = false;
}

function fail(msg) { $('#lede').hidden = true; $('#err').textContent = msg; $('#err').hidden = false; $('#again').hidden = false; }

async function load(url) { const r = await fetch(url); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }

async function boot() {
  const m = /^#kit=(1_[0-9a-zx._-]*)$/.exec(location.hash);
  if (!m) return fail(MISSING);
  try {
    const [survey, content] = await Promise.all([load('assets/survey.json'), load('assets/readiness.json')]);
    const answers = Readiness.decode(survey.questions, m[1]);
    if (!Object.keys(answers).length) return fail(MISSING);
    render(Readiness.build(content, answers, new Date()));
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
  } catch (e) { fail('The kit could not be loaded. Please check your connection and reload this page.'); }
}

$('#print').addEventListener('click', () => {
  const closed = [...document.querySelectorAll('details:not([open])')];
  closed.forEach(d => { d.open = true; });
  const undo = () => { closed.forEach(d => { d.open = false; }); removeEventListener('afterprint', undo); };
  addEventListener('afterprint', undo);
  window.print();
});
// A different kit link pasted into the address bar: build that kit instead.
addEventListener('hashchange', () => { if (location.hash.startsWith('#kit=')) location.reload(); });
boot();
})();
