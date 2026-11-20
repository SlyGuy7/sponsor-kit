const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const R = require('../assets/engine.js');
const S = require('../assets/survey.json');

const TODAY = new Date('2026-11-19T12:00:00');

// Builds a link the way the survey does: from a payload of answers.
const link = a => '/index.html#kit=' + R.encode(S.questions, a);
const SAMPLE = {
  q4: 'None, this is my first', q8_r2: 'Still not ready', q8_r3: 'Ready after Oct 8', q8_r6: 'Still not ready',
  q14: 'I needed help but didn’t know whom to contact', q16: '2', q19: '4',
  q18: 'A scope document template to sign with the Project Manager | A named Operations contact and instructions for getting help'
};
const axe = async page => (await new AxeBuilder({ page }).analyze()).violations.map(v => v.id + ': ' + v.help + ' ' + v.nodes.map(n => n.target).join(', '));

async function open(page, a = SAMPLE) {
  await page.clock.setFixedTime(TODAY);
  await page.goto(link(a));
  await expect(page.locator('#kit')).toBeVisible();
}

test('a link builds the kit: three priority actions, dates, contact, and next-project reference', async ({ page }) => {
  await open(page);
  await expect(page.locator('h1')).toHaveText('Your readiness kit');
  await expect(page.locator('#acts .step')).toHaveCount(3);
  await expect(page.locator('#acts .step').first()).toContainText('Sign the scope document');
  await expect(page.locator('#acts .step').first()).toHaveAttribute('data-n', '1');
  await expect(page.locator('#dateList li')).toHaveCount(4);                       // Sprint 4 (last day), Sprint 5, Showcase, evaluation
  await expect(page.locator('#dateList li').first()).toHaveClass(/next/);
  await expect(page.locator('#contactList')).toContainText('osama.eljabiri@njit.edu');
  await expect(page.locator('#next details.item').first()).toHaveAttribute('open', '');
  await expect(page.locator('body')).not.toContainText('danello');
});

test('the rest of the actions continue the numbering under "More for this semester"', async ({ page }) => {
  await open(page);
  const total = await page.locator('.step').count();
  await expect(page.locator('#moreSum')).toHaveText('More for this semester (' + (total - 3) + ')');
  await expect(page.locator('#more .step').first()).toHaveAttribute('data-n', '4');
});

test('items the sponsor picked come first, open, and are marked', async ({ page }) => {
  await open(page);
  const first = page.locator('#nextList details.item').first();
  await expect(first.locator('.tag')).toHaveText('You picked this');
  await expect(first).toHaveAttribute('open', '');
  await expect(page.locator('#nextList details.item[open]')).toHaveCount(2);
});

test('a sponsor with nothing wrong still gets a useful kit', async ({ page }) => {
  await open(page, { q4: '4 or more', q14: '5', q16: '5', q19: '5' });
  await expect(page.locator('#subActions')).toContainText('Nothing urgent');
  await expect(page.locator('#fixNum')).toHaveText('0');
  await expect(page.locator('#nextList details.item').first()).toBeVisible();
});

test('ticking steps updates the status, the progress and survives a reload', async ({ page }) => {
  await open(page);
  const step = page.locator('#acts .step').first(), boxes = step.locator('.checks input');
  const n = await page.locator('.checks input').count();
  await expect(page.locator('#progNum')).toHaveText('0 of ' + n);
  await expect(step.locator('.status')).toHaveText('To do');
  await boxes.first().check();
  await expect(step.locator('.status')).toHaveText('In progress');
  await expect(page.locator('#progNum')).toHaveText('1 of ' + n);
  for (const b of await boxes.all()) await b.check();
  await expect(step).toHaveAttribute('data-status', 'done');
  await expect(step.locator('.status')).toHaveText('Done');
  await page.reload();
  await expect(page.locator('#kit')).toBeVisible();
  await expect(page.locator('#acts .step').first()).toHaveAttribute('data-status', 'done');
  // a different kit link has its own ticks
  await page.goto('about:blank');
  await page.goto(link({ q8_r2: 'Still not ready' }));
  await expect(page.locator('#kit')).toBeVisible();
  await expect(page.locator('#acts .step').first()).toHaveAttribute('data-status', 'todo');
});

test('clicking a step\'s text ticks its box', async ({ page }) => {
  await open(page);
  await page.locator('#acts .checks label').first().click();
  await expect(page.locator('#acts .checks input').first()).toBeChecked();
});

test('dates count down, and the header shows the next one', async ({ page }) => {
  await open(page);
  await expect(page.locator('#dateList .left')).toHaveText(['Today', 'In 14 days', 'In 16 days', 'In 24 days']);
  await expect(page.locator('#nextWhen')).toHaveText('Today');
  await expect(page.locator('#nextWhat')).toHaveText('Sprint 4');
  await expect(page.locator('#dateList li').nth(2).locator('.cal')).toHaveText('Dec5');
});

test('after the last date the kit says the milestones have passed', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-01-10T12:00:00'));
  await page.goto(link(SAMPLE));
  await expect(page.locator('#noDates')).toBeVisible();
  await expect(page.locator('#dateList')).toBeHidden();
  await expect(page.locator('#ics')).toBeHidden();
});

test('Add to calendar downloads a valid calendar file with the dates ahead', async ({ page }) => {
  await open(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ics')]);
  expect(dl.suggestedFilename()).toBe('capstone-sponsor-dates.ics');
  const text = require('fs').readFileSync(await dl.path(), 'utf8');
  expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(text.trim().endsWith('END:VCALENDAR')).toBe(true);
  expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(4);
  expect(text).toContain('DTSTART;VALUE=DATE:20261205');
  expect(text).toContain('DTEND;VALUE=DATE:20261206');
  expect(text).toContain('SUMMARY:Capstone: Final Capstone Showcase');
  for (const line of text.split('\r\n')) expect(line.length).toBeLessThanOrEqual(75);
  await expect(page.locator('#toast')).toContainText('Calendar file downloaded');
});

test('Copy link copies the kit link and says so', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.click('#copy');
  await expect(page.locator('#toast')).toContainText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

test('no link, or a damaged one, explains itself and offers the survey', async ({ page }) => {
  for (const h of ['', '#kit=garbage', '#kit=1_99-1', '#other']) {
    await page.goto('/index.html' + h);
    await expect(page.locator('#err')).toContainText('missing or damaged');
    await expect(page.locator('#kit')).toBeHidden();
    await expect(page.locator('#sum')).toBeHidden();
    await expect(page.locator('#print')).toBeHidden();
    await expect(page.locator('#copy')).toBeHidden();
    await expect(page.locator('#again')).toHaveAttribute('href', 'https://slyguy7.github.io/sponsor-survey/');
  }
});

test('nothing is sent anywhere: the page only reads its own files', async ({ page }) => {
  const outside = [], reqs = [];
  page.on('request', r => { reqs.push(r.method() + ' ' + new URL(r.url()).pathname); if (!/^http:\/\/127\.0\.0\.1/.test(r.url())) outside.push(r.url()); });
  await open(page);
  await page.locator('.checks input').first().check();
  expect(outside).toEqual([]);
  expect(reqs.filter(r => !r.startsWith('GET '))).toEqual([]);
});

test('the answers never appear in the page text, only the advice they led to', async ({ page }) => {
  await open(page, { ...SAMPLE, contact_name: 'Pat Example', contact_email: 'pat@acme.test' });
  const text = await page.locator('body').innerText();
  for (const s of ['Pat Example', 'pat@acme.test']) expect(text).not.toContain(s);
});

test('Print opens every section first, then closes them again', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { window.__state = null; window.print = () => { window.__state = [...document.querySelectorAll('details')].every(d => d.open); dispatchEvent(new Event('afterprint')); }; });
  await page.click('#print');
  expect(await page.evaluate(() => window.__state)).toBe(true);
  expect(await page.locator('#moreWrap').evaluate(d => d.open)).toBe(false);
});

test('printouts carry the date and the link to reopen the kit, without buttons', async ({ page }) => {
  await open(page);
  await expect(page.locator('#printed')).toBeHidden();
  await expect(page.locator('#printed')).toContainText('#kit=1_');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#printed')).toBeVisible();
  await expect(page.locator('#printed')).toContainText('Prepared November 19, 2026');
  for (const s of ['#print', '#copy', '#ics', '.side']) await expect(page.locator(s)).toBeHidden();
});

test('side links move to each section and mark the current one', async ({ page }) => {
  await open(page);
  await page.locator('.side a', { hasText: 'Key dates' }).click();
  await expect(page.locator('#dates')).toBeInViewport();
  await expect(page.locator('.side a[aria-current="true"]')).toHaveCount(1);
});

test('the kit link stays in the address after using the side links, so a reload still works', async ({ page }) => {
  await open(page);
  const url = page.url();
  await page.locator('.side a', { hasText: 'Who to contact' }).click();
  await expect(page.locator('#contacts')).toBeInViewport();
  expect(page.url()).toBe(url);
  await expect(page.locator('#hContacts')).toBeFocused();
  await page.reload();
  await expect(page.locator('#kit')).toBeVisible();
});

test('pasting a different kit link rebuilds the page', async ({ page }) => {
  await open(page);
  await expect(page.locator('#acts .step').first()).toContainText('Sign the scope document');
  await page.evaluate(h => { location.hash = h; }, '#kit=' + R.encode(S.questions, { q8_r4: 'Still not ready' }));
  await expect(page.locator('#acts .step').first()).toContainText('Get data and documents');
});

test('the theme button switches light and dark, remembers it, and overrides the system', async ({ page }) => {
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await open(page);
  expect(await bg()).toBe('rgb(255, 255, 255)');
  await expect(page.locator('#theme')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#theme .i-moon')).toBeVisible();
  await page.click('#theme');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#theme')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#theme .i-sun')).toBeVisible();
  expect(await bg()).toBe('rgb(14, 10, 51)');
  // remembered, and applied before the page is drawn (theme.js runs in <head>)
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // a light choice wins over a dark system setting
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.click('#theme');
  expect(await bg()).toBe('rgb(255, 255, 255)');
  // printing is always light
  await page.click('#theme');
  await page.emulateMedia({ media: 'print' });
  expect(await bg()).toBe('rgb(255, 255, 255)');
});

test('with no saved choice the page follows a dark system setting', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
  await expect(page.locator('#theme')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#theme .i-sun')).toBeVisible();
});

test('"Email this to my PM" opens a filled-in email with the action, its steps and the kit link', async ({ page }) => {
  await open(page);
  const href = await page.locator('#acts .step').first().locator('a.mini').getAttribute('href');
  expect(href.startsWith('mailto:?subject=')).toBe(true);
  const q = new URLSearchParams(href.slice('mailto:?'.length));
  expect(q.get('subject')).toBe('Capstone: Sign the scope document with your PM');
  expect(q.get('body')).toContain('- Ask your PM for the current scope document.');
  expect(q.get('body')).toContain('Source: Sponsor Guide, section 6');
  expect(q.get('body')).toContain('#kit=1_');
});

test('"Hide finished" hides done actions, is remembered, and printing still shows them', async ({ page }) => {
  await open(page);
  const first = page.locator('#acts .step').first();
  for (const b of await first.locator('.checks input').all()) await b.check();
  await expect(page.locator('#hideDone')).toHaveText('Hide finished (1)');
  await page.click('#hideDone');
  await expect(page.locator('#hideDone')).toHaveAttribute('aria-pressed', 'true');
  await expect(first).toBeHidden();
  await page.reload();
  await expect(page.locator('#acts .step').first()).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#acts .step').first()).toBeVisible();
});

test('when every step is ticked the kit says so', async ({ page }) => {
  await open(page, { q8_r2: 'Still not ready' });
  await expect(page.locator('#allDone')).toBeHidden();
  for (const b of await page.locator('.checks input').all()) await b.check({ force: true });
  await expect(page.locator('#allDone')).toBeVisible();
});

test('"Copy my action list" copies every action with its ticks', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.locator('#acts .checks input').first().check();
  await page.click('#copyList');
  await expect(page.locator('#toast')).toContainText('Action list copied');
  const text = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  expect(text).toContain('1. Sign the scope document with your PM');
  expect(text).toContain('[x] Ask your PM for the current scope document.');
  expect(text).toContain('[ ] Check that each of those six parts');
  expect(text).toContain('Kit: ' + page.url());
});

test('"Clear all ticks" asks first, then clears them', async ({ page }) => {
  await open(page);
  await expect(page.locator('#clearTicks')).toBeDisabled();
  await page.locator('#acts .checks input').first().check();
  page.once('dialog', d => d.dismiss());
  await page.click('#clearTicks');
  await expect(page.locator('#acts .checks input').first()).toBeChecked();
  page.once('dialog', d => d.accept());
  await page.click('#clearTicks');
  await expect(page.locator('#acts .checks input').first()).not.toBeChecked();
  await page.reload();
  await expect(page.locator('#progNum')).toHaveText(/^0 of/);
});

test('each date can be added to the calendar on its own', async ({ page }) => {
  await open(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#dateList li').nth(2).locator('.mini-btn').click()]);
  expect(dl.suggestedFilename()).toBe('capstone-final-capstone-showcase.ics');
  const text = require('fs').readFileSync(await dl.path(), 'utf8');
  expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  expect(text).toContain('SUMMARY:Capstone: Final Capstone Showcase');
});

test('"Expand all" opens every next-project item and becomes "Collapse all"', async ({ page }) => {
  await open(page);
  await expect(page.locator('#toggleAll')).toHaveText('Expand all');
  await page.click('#toggleAll');
  await expect(page.locator('#nextList details:not([open])')).toHaveCount(0);
  await expect(page.locator('#toggleAll')).toHaveText('Collapse all');
  await expect(page.locator('#toggleAll')).toHaveAttribute('aria-expanded', 'true');
  await page.click('#toggleAll');
  await expect(page.locator('#nextList details[open]')).toHaveCount(0);
});

test('next-project items and contact emails can be copied as text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.locator('#nextList details').first().locator('.mini-btn').click();
  let text = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  expect(text.startsWith('Scope document template')).toBe(true);
  expect(text).toContain('Boundaries\nWhat is in scope');
  await page.locator('#contactList .mini-btn').click();
  text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toBe('osama.eljabiri@njit.edu');
});

test('a return visit points out guide content that changed, until "Got it"', async ({ page }) => {
  await open(page);
  await expect(page.locator('#whatsNew')).toBeHidden();                         // first visit: nothing to compare with
  const key = await page.evaluate(() => Object.keys(localStorage).find(k => k.startsWith('sponsor-kit-seen:')));
  await page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s['date:Final Capstone Showcase'] = 'old'; s['act:gap-scope-doc'] = 'old'; localStorage.setItem(k, JSON.stringify(s)); }, key);
  await page.reload();
  await expect(page.locator('#whatsNew')).toBeVisible();
  await expect(page.locator('#newCount')).toHaveText('2 items have changed since your last visit:');
  await expect(page.locator('#newList li')).toHaveText(['Sign the scope document with your PM', 'Final Capstone Showcase']);
  await expect(page.locator('.upd')).toHaveCount(2);
  await page.click('#gotIt');
  await expect(page.locator('#whatsNew')).toBeHidden();
  await expect(page.locator('.upd')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#kit')).toBeVisible();
  await expect(page.locator('#whatsNew')).toBeHidden();
});

test('"Back to top" appears after scrolling and returns to the top', async ({ page }) => {
  await open(page);
  await expect(page.locator('#toTop')).not.toHaveClass(/on/);
  await page.locator('#next').scrollIntoViewIfNeeded();
  await expect(page.locator('#toTop')).toHaveClass(/on/);
  await page.click('#toTop');
  await expect(page.locator('h1')).toBeInViewport();
  await expect(page.locator('h1')).toBeFocused();
});

test('link previews: title, description and a 1200x630 image', async ({ page, request }) => {
  await page.goto('/index.html');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Sponsor readiness kit');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /readiness kit/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://slyguy7.github.io/sponsor-kit/assets/og.png');
  const png = await (await request.get('/assets/og.png')).body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
});

test('the skip link jumps to the kit', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip')).toBeFocused();
  await expect(page.locator('.skip')).toBeInViewport();
});

for (const [w, h] of [[320, 640], [375, 812], [768, 1024], [1280, 800], [1920, 1080]]) {
  test(`${w}x${h}: no sideways scroll and the sections are reachable`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator('#print')).toBeVisible();
    await expect(page.locator('#copy')).toBeVisible();
    await expect(page.locator('.side a').first()).toBeVisible();
  });
}

test('the kit passes the accessibility scan, with the extra sections open', async ({ page }) => {
  await open(page);
  await page.locator('#acts .checks input').first().check();
  await page.locator('#moreWrap summary').click();
  expect(await axe(page)).toEqual([]);
});

test('the kit passes the accessibility scan in dark mode and on a phone', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page);
  await page.locator('#acts .checks input').first().check();
  expect(await axe(page)).toEqual([]);
});

test('the missing-link page passes the accessibility scan', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#err')).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test('the 404 page is styled, accessible and leads to the survey', async ({ page }) => {
  await page.goto('/sponsor-kit/404.html');
  await expect(page.locator('h1')).toHaveText('That page does not exist');
  await expect(page.locator('.hero')).toHaveCSS('background-color', 'rgb(28, 20, 117)');   // kit.css loaded from the Pages path
  await expect(page.locator('a.btn')).toHaveAttribute('href', 'https://slyguy7.github.io/sponsor-survey/');
  expect(await axe(page)).toEqual([]);
});

test('page basics: noindex, strict CSP, self-hosted fonts, no inline scripts or styles, no px font sizes', async ({ page }) => {
  await open(page);
  await page.locator('.checks input').first().check();
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex,nofollow');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("font-src 'self'");
  expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(await page.locator('script:not([src])').count()).toBe(0);
  expect(await page.locator('[style]').count()).toBe(0);
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 1rem "Bricolage Grotesque"') && document.fonts.check('400 1rem "Instrument Sans"'); })).toBe(true);
  expect(require('fs').readFileSync(require('path').join(__dirname, '..', 'assets', 'kit.css'), 'utf8')).not.toMatch(/font-size:\s*[\d.]+px/);
});
