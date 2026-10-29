import type { Locator, Page } from '@playwright/test';
import { addFieldLine, API_URL, expect, login, test, uniqueMobile } from './helpers';

// Reception's marks on the OPD queue (physician's sheet, 29/10/2026): a photo (or
// the placeholder), Present with the time it was ticked, Critically ill, Pt needs
// urgent attention, a row colour, and a status worked out from the visit.
// Real browser, real API, throwaway database; every name is made up.
//
// Uses the `opdQueueDay` doctor: it is the only seeded doctor for an OPD journey,
// and it adds two patients to TODAY's queue, which opd-queue-day.spec.ts expects
// to be empty. Run the two files in separate runs, or give this one a seeded
// doctor of its own (server/test/seed-e2e.ts + helpers.ts Role) before running
// the whole suite.

const A = 'Presence Patient A';
const B = 'Presence Patient B';
const C = 'Presence Patient C';
const TIME = /\d{1,2}\.\d{2}(am|pm)/;

const row = (page: Page, name: string): Locator => page.locator('.queue-row').filter({ hasText: name });
const box = (page: Page, kind: 'Present' | 'Critically ill' | 'Pt needs urgent attention', name: string): Locator =>
  page.getByRole('checkbox', { name: `${kind}: ${name}` });
const card = (page: Page, which: 'Total Serial' | 'Present' | 'Completed' | 'Waiting'): Locator =>
  page.locator(`[data-card="${which}"] [data-card-value]`);
// The label that holds the Present box also holds the time written under it.
const presentLabel = (page: Page, name: string): Locator =>
  row(page, name).locator('label').filter({ has: box(page, 'Present', name) });

/** "+ Add to queue" → a number no one has → Add New → a name → Save. */
async function addNewToQueue(page: Page, name: string) {
  await page.getByRole('button', { name: '+ Add to queue' }).click();
  await page.getByPlaceholder('01XXXXXXXXX').fill(uniqueMobile());
  await page.getByRole('button', { name: /No patient on this number/ }).click();
  await page.getByPlaceholder('Full name').fill(name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(row(page, name)).toBeVisible();
}

interface ApiVisit { name: string; presentAt: string | null; criticallyIll: boolean; urgent: boolean; padStage: string | null }
const apiQueue = async (page: Page): Promise<ApiVisit[]> => {
  const res = await page.request.get(`${API_URL}/opd`);
  expect(res.status(), 'GET /opd').toBe(200);
  return (await res.json()) as ApiVisit[];
};

/** A mark is stored once the server has answered the PATCH: wait for it, not a pause. */
const marked = (page: Page) =>
  page.waitForResponse((r) => /\/opd\/[^/]+\/presence$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok());
async function tick(page: Page, kind: 'Present' | 'Critically ill' | 'Pt needs urgent attention', name: string, on: boolean) {
  const saved = marked(page);
  await box(page, kind, name).click();
  await saved;
  if (on) await expect(box(page, kind, name)).toBeChecked();
  else await expect(box(page, kind, name)).not.toBeChecked();
}

test('a queue row shows a photo, three marks, a time, a colour and a status; the server keeps them', async ({ page }) => {
  await login(page, 'opdQueueDay');
  await page.goto('/opd');
  await expect(page.getByText('No one is in the queue')).toBeVisible();
  await addNewToQueue(page, A);
  await addNewToQueue(page, B);
  await addNewToQueue(page, C);

  // ── a. the row as it is built ──────────────────────────────────────────────
  for (const name of [A, B]) {
    const r = row(page, name);
    await expect(r.getByRole('img', { name: `Photo of ${name}` })).toBeVisible();
    await expect(r.locator('img')).toHaveCount(0); // no picture: the placeholder, drawn as an icon
    await expect(box(page, 'Present', name)).toBeVisible();
    await expect(box(page, 'Critically ill', name)).toBeVisible();
    await expect(box(page, 'Pt needs urgent attention', name)).toBeVisible();
    await expect(r).not.toContainText(/T-\d/); // the token chip is gone
    await expect(r).not.toContainText('Incomplete');
    await expect(r.locator('[data-status]')).toHaveCount(0); // nobody is marked present yet
    await expect(r).not.toHaveAttribute('data-tone', /.+/);
  }
  await expect(card(page, 'Total Serial')).toHaveText('3');
  await expect(card(page, 'Present')).toHaveText('0');
  await expect(card(page, 'Waiting')).toHaveText('0');

  // ── b. Present: the time, the two cards ────────────────────────────────────
  await tick(page, 'Present', A, true);
  await expect(presentLabel(page, A)).toContainText(TIME);
  await expect(card(page, 'Present')).toHaveText('1');
  await expect(card(page, 'Waiting')).toHaveText('1');
  await tick(page, 'Present', A, false);
  await expect(presentLabel(page, A)).not.toContainText(TIME);
  await expect(card(page, 'Present')).toHaveText('0');
  await expect(card(page, 'Waiting')).toHaveText('0');

  // ── c. the colour: Urgent over Critically ill ──────────────────────────────
  await tick(page, 'Critically ill', A, true);
  await expect(row(page, A)).toHaveAttribute('data-tone', 'warn');
  await tick(page, 'Pt needs urgent attention', A, true);
  await expect(row(page, A)).toHaveAttribute('data-tone', 'danger');
  await tick(page, 'Pt needs urgent attention', A, false);
  await expect(row(page, A)).toHaveAttribute('data-tone', 'warn');

  // ── d. the status, and what the server keeps ───────────────────────────────
  await tick(page, 'Present', B, true);
  await expect(row(page, B)).toHaveAttribute('data-tone', 'ok');
  await expect(row(page, B).locator('[data-status]')).toHaveText('Waiting');

  // Chief complaint on B's prescription screen, then back to OPD. The Prescribe
  // button is the app's own way in: it opens B in the editor.
  await row(page, B).getByRole('button', { name: 'Prescribe' }).click();
  await expect(page).toHaveURL(/\/prescription$/);
  await expect(page.getByPlaceholder('Patient name')).toHaveValue(B);
  const parked = page.waitForResponse((r) =>
    /\/patients\/[^/]+$/.test(r.url()) && r.request().method() === 'PATCH' && r.ok()
    && (r.request().postData() ?? '').includes('Fever for two days'), { timeout: 60_000 });
  await addFieldLine(page, 'Chief complaints', 'Fever for two days');
  await parked;
  await page.getByRole('button', { name: /^OPD$/ }).or(page.getByText('OPD', { exact: true })).first().click();
  await expect(page).toHaveURL(/\/opd$/);
  await expect(row(page, B).locator('[data-status]')).toHaveText('History taken');
  expect((await apiQueue(page)).find((v) => v.name === B)?.padStage).toBe('history');

  // A reload keeps every mark: they are the server's.
  await tick(page, 'Present', C, true);
  await tick(page, 'Critically ill', B, true);
  await tick(page, 'Pt needs urgent attention', A, true); // A was warn (critically ill): now danger
  await page.reload();
  await expect(row(page, A)).toHaveAttribute('data-tone', 'danger');
  await expect(row(page, B)).toHaveAttribute('data-tone', 'warn');
  await expect(row(page, C)).toHaveAttribute('data-tone', 'ok');
  await expect(box(page, 'Critically ill', A)).toBeChecked();
  await expect(box(page, 'Pt needs urgent attention', A)).toBeChecked();
  await expect(box(page, 'Present', B)).toBeChecked();
  await expect(presentLabel(page, B)).toContainText(TIME);
  await expect(row(page, B).locator('[data-status]')).toHaveText('History taken');
  await expect(row(page, C).locator('[data-status]')).toHaveText('Waiting');
  await expect(card(page, 'Present')).toHaveText('2');
  await expect(card(page, 'Waiting')).toHaveText('2');
  const stored = await apiQueue(page);
  expect(stored.find((v) => v.name === A)).toMatchObject({ presentAt: null, criticallyIll: true, urgent: true });
  expect(stored.find((v) => v.name === B)).toMatchObject({ criticallyIll: true, urgent: false });
  expect(stored.find((v) => v.name === B)?.presentAt).toBeTruthy();

  // ── e. the evidence: one row of each tone, wide, phone, night ──────────────
  await expect(row(page, B).locator('[data-status]')).toHaveText('History taken');
  // The app scrolls inside its own shell on a phone, so a full-page capture stops at the fold:
  // bring the middle row (and so the other two) into view first.
  const shot = async (name: string) => {
    await row(page, B).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `evidence/opd-presence-${name}.png`, fullPage: true });
  };
  await page.setViewportSize({ width: 1280, height: 800 });
  await shot('desktop');
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(row(page, A)).toBeVisible();
  await shot('phone');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Night mode' }).click();
  await expect(page.getByRole('button', { name: 'Night mode' })).toHaveAttribute('aria-pressed', 'true');
  await shot('night');
  await page.setViewportSize({ width: 375, height: 812 });
  await shot('night-phone');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Light mode' }).click();
});
