import type { Page } from '@playwright/test';
import { API_URL, expect, login, test, uniqueMobile } from './helpers';

// The OPD queue is booked by DAY (physician's sheet, 28/10/2026): the date opens
// a calendar, a later day is filled and put in order, each patient is told a time
// worked out from that day's saved schedule, and a day that has passed is locked.
// Real browser, real API, throwaway database; every name is made up.

const DAY_MS = 24 * 60 * 60 * 1000;
// The Dhaka calendar day, offset by `days`, as the app writes it.
const dayKey = (days: number) => new Date(Date.now() + 6 * 60 * 60 * 1000 + days * DAY_MS).toISOString().slice(0, 10);
const TODAY = dayKey(0);
const LATER = dayKey(3);
const PAST = dayKey(-1);

const dateButton = (page: Page) => page.getByRole('button', { name: /^Date: / });
const rows = (page: Page) => page.locator('.queue-row');
const names = async (page: Page) => (await rows(page).locator('div[style*="font-size: 13px"][style*="font-weight: 500"]').allInnerTexts()).map((t) => t.trim());

/** Opens the calendar and chooses `key`, turning the page of months as needed. */
async function chooseDay(page: Page, key: string) {
  await dateButton(page).click();
  const calendar = page.getByRole('dialog', { name: 'Choose a date' });
  await expect(calendar).toBeVisible();
  const day = calendar.locator(`[data-day="${key}"]`);
  for (let i = 0; i < 3 && (await day.count()) === 0; i++) {
    await calendar.getByRole('button', { name: key > TODAY ? 'Next month' : 'Previous month' }).click();
  }
  await day.click();
  await expect(calendar).toBeHidden();
}

/** "+ Add to queue" → a number no one has → Add New → a name → Save. */
async function addNewToQueue(page: Page, name: string) {
  await page.getByRole('button', { name: '+ Add to queue' }).click();
  await page.getByPlaceholder('01XXXXXXXXX').fill(uniqueMobile());
  await page.getByRole('button', { name: /No patient on this number/ }).click();
  await page.getByPlaceholder('Full name').fill(name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(rows(page).filter({ hasText: name })).toBeVisible();
}

interface ApiVisit { name: string; token: string; position: number | null; queueDate: string | null }
const apiQueue = async (page: Page, day: string): Promise<ApiVisit[]> => {
  const res = await page.request.get(`${API_URL}/opd?date=${day}`);
  expect(res.status(), `GET /opd?date=${day}`).toBe(200);
  return (await res.json()) as ApiVisit[];
};

test('a later day is booked, timed and put in order; today is untouched; a day that has passed is locked', async ({ page }) => {
  await login(page, 'opdQueueDay');
  await page.goto('/opd');

  // Opens on today, and says so.
  await expect(dateButton(page)).toContainText('Today');
  await expect(page.getByText('No one is in the queue')).toBeVisible();

  // ── A later day, from the calendar ─────────────────────────────────────────
  await chooseDay(page, LATER);
  await expect(dateButton(page)).toContainText('Upcoming');
  await expect(page.getByText('Total', { exact: true })).toBeVisible(); // not "Total today"

  // Its schedule: 6 PM, a break from 8 to 9 PM, 10 minutes each.
  await page.getByLabel('Start time').fill('18:00');
  await page.getByLabel('Break from').fill('20:00');
  await page.getByLabel('Break to').fill('21:00');
  await page.getByLabel('Minutes per patient').fill('10');
  await expect(page.getByText(/Not saved yet/)).toBeVisible();
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByRole('button', { name: 'Save schedule' })).toBeDisabled();
  await expect(page.getByText(/Not saved yet/)).toBeHidden();

  // Three patients are added to THAT day.
  await addNewToQueue(page, 'Queue Patient A');
  await addNewToQueue(page, 'Queue Patient B');
  await addNewToQueue(page, 'Queue Patient C');
  expect(await names(page)).toEqual(['Queue Patient A', 'Queue Patient B', 'Queue Patient C']);
  // Each is told a time, from the saved schedule.
  await expect(rows(page).locator('[data-time]')).toHaveText(['6:00 PM', '6:10 PM', '6:20 PM']);
  // Nobody is prescribed for or marked done before their day.
  await expect(page.getByRole('button', { name: 'Prescribe' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Done' })).toHaveCount(0);

  // ── The order ──────────────────────────────────────────────────────────────
  await expect(page.getByRole('button', { name: 'Move Queue Patient A up' })).toBeDisabled();
  await page.getByRole('button', { name: 'Move Queue Patient C up' }).click();
  await expect.poll(() => names(page)).toEqual(['Queue Patient A', 'Queue Patient C', 'Queue Patient B']);
  // The time belongs to the place, the token to the patient.
  await expect(rows(page).locator('[data-time]')).toHaveText(['6:00 PM', '6:10 PM', '6:20 PM']);
  const stored = await apiQueue(page, LATER);
  expect(stored.map((v) => v.name)).toEqual(['Queue Patient A', 'Queue Patient C', 'Queue Patient B']);
  expect(stored.map((v) => v.position)).toEqual([1, 2, 3]);
  expect(stored.map((v) => v.token)).toEqual(['T-01', 'T-03', 'T-02']);
  expect(stored.every((v) => v.queueDate === LATER)).toBe(true);

  // …and the order and the schedule are the server's: they survive a reload.
  await page.reload();
  await chooseDay(page, LATER);
  await expect.poll(() => names(page)).toEqual(['Queue Patient A', 'Queue Patient C', 'Queue Patient B']);
  await expect(page.getByLabel('Minutes per patient')).toHaveValue('10');
  await expect(page.getByLabel('Break from')).toHaveValue('20:00');

  // ── Today has none of it ───────────────────────────────────────────────────
  await chooseDay(page, TODAY);
  await expect(page.getByText('No one is in the queue')).toBeVisible();
  expect(await apiQueue(page, TODAY)).toEqual([]);

  // ── A day that has passed is locked, on the screen and in the API ──────────
  await chooseDay(page, PAST);
  await expect(dateButton(page)).toContainText('Locked');
  await expect(page.getByRole('button', { name: '+ Add to queue' })).toBeDisabled();
  await expect(page.getByLabel('Start time')).toBeDisabled();
  await expect(page.getByLabel('Minutes per patient')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save schedule' })).toHaveCount(0);
  await expect(page.getByText(/has passed/).first()).toBeVisible();

  const refused = await page.request.post(`${API_URL}/opd`, { data: { name: 'Past Add', date: PAST } });
  expect(refused.status()).toBe(400);
  expect(((await refused.json()) as { message: string }).message).toMatch(/passed/i);
  expect(await apiQueue(page, PAST)).toEqual([]);
  const refusedSchedule = await page.request.put(`${API_URL}/opd/schedule`, {
    data: { date: PAST, startTime: '09:00', minutesPerPatient: 5 },
  });
  expect(refusedSchedule.status()).toBe(400);
});
