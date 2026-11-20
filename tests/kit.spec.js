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

async function open(page, a = SAMPLE) {
  await page.clock.setFixedTime(TODAY);
  await page.goto(link(a));
  await expect(page.locator('#kit')).toBeVisible();
}

test('a link builds the kit: three priority actions, dates, contact, and next-project reference', async ({ page }) => {
  await open(page);
  await expect(page.locator('h1')).toHaveText('Your readiness kit');
  await expect(page.locator('#acts .act')).toHaveCount(3);
  await expect(page.locator('#acts .act').first()).toContainText('Sign the scope document');
  await expect(page.locator('#sum')).toContainText('dates ahead');
  await expect(page.locator('#dateList li')).toHaveCount(4);                       // Sprint 4 (last day), Sprint 5, Showcase, evaluation
  await expect(page.locator('#dateList li').first()).toHaveClass(/next/);
  await expect(page.locator('#contactList')).toContainText('osama.eljabiri@njit.edu');
  await expect(page.locator('#next details.item').first()).toHaveAttribute('open', '');
  await expect(page.locator('body')).not.toContainText('danello');
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
  await expect(page.locator('#sum')).toContainText('0');
  await expect(page.locator('#nextList details.item').first()).toBeVisible();
});

test('after the last date the kit says the milestones have passed', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-01-10T12:00:00'));
  await page.goto(link(SAMPLE));
  await expect(page.locator('#noDates')).toBeVisible();
  await expect(page.locator('#dateList')).toBeHidden();
});

test('no link, or a damaged one, explains itself and offers the survey', async ({ page }) => {
  for (const h of ['', '#kit=garbage', '#kit=1_99-1', '#other']) {
    await page.goto('/index.html' + h);
    await expect(page.locator('#err')).toContainText('missing or damaged');
    await expect(page.locator('#kit')).toBeHidden();
    await expect(page.locator('#print')).toBeHidden();
    await expect(page.locator('#again')).toHaveAttribute('href', 'https://slyguy7.github.io/sponsor-survey/');
  }
});

test('nothing is sent anywhere: the page only reads its own files', async ({ page }) => {
  const outside = [], reqs = [];
  page.on('request', r => { reqs.push(r.method() + ' ' + new URL(r.url()).pathname); if (!/^http:\/\/127\.0\.0\.1/.test(r.url())) outside.push(r.url()); });
  await open(page);
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

test('side links move to each section and mark the current one', async ({ page }) => {
  await open(page);
  await page.locator('.side a', { hasText: 'Key dates' }).click();
  await expect(page.locator('#dates')).toBeInViewport();
  await expect(page.locator('.side a[aria-current="true"]')).toHaveCount(1);
});

for (const [w, h] of [[320, 640], [375, 812], [768, 1024], [1280, 800], [1920, 1080]]) {
  test(`${w}x${h}: no sideways scroll and the sections are reachable`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator('#print')).toBeVisible();
    await expect(page.locator('.side a').first()).toBeVisible();
  });
}

test('the kit passes the accessibility scan', async ({ page }) => {
  await open(page);
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.map(v => v.id + ': ' + v.help)).toEqual([]);
});

test('the missing-link page passes the accessibility scan', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#err')).toBeVisible();
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations.map(v => v.id + ': ' + v.help)).toEqual([]);
});

test('page basics: noindex, strict CSP, no inline scripts or styles, no px font sizes', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex,nofollow');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
  expect(await page.locator('script:not([src])').count()).toBe(0);
  expect(await page.locator('[style]').count()).toBe(0);
  expect(require('fs').readFileSync(require('path').join(__dirname, '..', 'assets', 'kit.css'), 'utf8')).not.toMatch(/font-size:\s*[\d.]+px/);
});
