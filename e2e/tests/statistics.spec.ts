import type { Page } from '@playwright/test';
import { API_URL, expect, login, test, uniqueMobile } from './helpers';

// Settings → Statistics (physician's sheet, 11/11/2026): a card after Payment, a
// horizontal menu of Patient statistics and Disease statistics, a chart of the
// OPD queue by days and by months, five overall numbers, and the final
// diagnoses with their number of patients. Real browser, real API, throwaway
// database; names made up. The patients are put on the queue and the
// prescriptions are written through the API (the real routes), because what is
// under test is the page that reads them.

const api = (page: Page) => page.request;

async function onQueue(page: Page, name: string, seen: boolean) {
  const added = await api(page).post(`${API_URL}/opd`, { data: { name } });
  expect(added.status()).toBe(201);
  const { id } = (await added.json()) as { id: string };
  if (seen) expect((await api(page).patch(`${API_URL}/opd/${id}/status`, { data: { status: 'done' } })).ok()).toBe(true);
}

async function patientWithDiagnosis(page: Page, name: string, finalDiagnosis: string[], visits = 1): Promise<void> {
  const made = await api(page).post(`${API_URL}/patients`, { data: { name, mobile: uniqueMobile() } });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  for (let v = 0; v < visits; v++) {
    // each prescription a little different: the same one sent again is answered with the one on record
    const rx = await api(page).post(`${API_URL}/prescriptions`, {
      data: { patientId: id, finalDiagnosis, items: [{ drug: 'Tablet. Napa 500 mg', dose: `1+0+${v + 1}`, duration: '5 days', instruction: '' }] },
    });
    expect(rx.status()).toBe(201);
  }
}

test('Settings → Statistics: the numbers of the OPD queue and the final diagnoses', async ({ page }) => {
  await login(page, 'statistics');

  // Today: four on the queue, three of them seen (Done pressed).
  await onQueue(page, 'Stat One', true);
  await onQueue(page, 'Stat Two', true);
  await onQueue(page, 'Stat Three', true);
  await onQueue(page, 'Stat Four', false);
  // Final diagnoses: DM for two patients (one of them seen three times), HTN for one,
  // and "dm" written in small letters for a third — the same diagnosis, a third patient.
  await patientWithDiagnosis(page, 'Dx One', ['DM'], 3);
  await patientWithDiagnosis(page, 'Dx Two', ['DM', 'HTN']);
  await patientWithDiagnosis(page, 'Dx Three', ['dm']);
  await patientWithDiagnosis(page, 'Dx Four', ['Diabetes mellitus']);

  // The card is right after Payment, and opens the page.
  await page.goto('/settings');
  const cards = page.locator('.card-press');
  await expect(cards.filter({ hasText: /^Payment/ })).toBeVisible(); // the page is drawn before it is read
  const titles = await cards.allInnerTexts();
  const payment = titles.findIndex((t) => t.startsWith('Payment'));
  expect(titles[payment + 1]).toMatch(/^Statistics/);
  await cards.nth(payment + 1).click();
  await expect(page).toHaveURL(/\/settings\/statistics$/);

  // A horizontal menu of two, on Patient statistics.
  const menu = page.getByRole('tablist', { name: 'Statistics' });
  await expect(menu.getByRole('tab')).toHaveText(['Patient statistics', 'Disease statistics']);
  await expect(menu.getByRole('tab', { name: 'Patient statistics' })).toHaveAttribute('aria-selected', 'true');

  // By days: every day of the month, today's bars at the right height.
  const chart = page.locator('[data-stats-chart="days"]');
  await expect(chart).toBeVisible();
  const today = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const todayBar = chart.locator(`[data-bar="${today}"]`);
  const total = Number(await todayBar.locator('[data-kind="total"]').getAttribute('height'));
  const seen = Number(await todayBar.locator('[data-kind="seen"]').getAttribute('height'));
  expect(total).toBeGreaterThan(0);
  expect(seen / total).toBeCloseTo(3 / 4, 3);
  await expect(page.locator('[data-stats-summary]').first()).toHaveText('Total serial: 4Seen: 3');
  // (exact: the header's own "My Chamber" box has the word in its name too)
  await expect(page.getByLabel('Chamber', { exact: true })).toHaveValue('all');

  // The overall numbers: three seen since today (one day, one month), nothing last month.
  const stat = (id: string) => page.locator(`[data-stat="${id}"] [data-stat-value]`);
  await expect(stat('total')).toHaveText('3');
  await expect(stat('monthly')).toHaveText('3.0');
  await expect(stat('daily')).toHaveText('3.0');
  await expect(stat('thisMonth')).toHaveText('3');
  await expect(stat('previousMonth')).toHaveText('0');

  // By months: one bar a month, the seen number over this month's.
  await page.getByLabel('Show').selectOption('months');
  const months = page.locator('[data-stats-chart="months"]');
  await expect(months.locator('[data-bar]')).toHaveCount(12);
  await expect(months.locator('[data-kind="value"]')).toHaveText(['3']);

  // The arrows move the period.
  await page.getByRole('button', { name: 'Previous year' }).click();
  await expect(months.locator('[data-kind="value"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Next year' }).click();
  await expect(months.locator('[data-kind="value"]')).toHaveText(['3']);

  // One chamber: the main chamber holds all of it; a chamber added now holds none.
  await page.getByLabel('Show').selectOption('days');
  await page.getByLabel('Chamber', { exact: true }).selectOption({ label: 'Main chamber' });
  await expect(page.locator('[data-stats-summary]').first()).toHaveText('Total serial: 4Seen: 3');

  // Disease statistics: different patients per diagnosis, most first.
  await menu.getByRole('tab', { name: 'Disease statistics' }).click();
  const rows = page.locator('[data-disease]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute('data-disease', /^dm$/i);
  await expect(rows.nth(0).locator('[data-disease-count]')).toHaveText('3'); // DM ×3 visits is one patient; + Dx Two + Dx Three
  await expect(page.locator('[data-disease="HTN"] [data-disease-count]')).toHaveText('1');
  await expect(page.locator('[data-disease="Diabetes mellitus"] [data-disease-count]')).toHaveText('1');

  // Still there after a reload: the address is the page.
  await page.reload();
  await expect(page.getByRole('tablist', { name: 'Statistics' })).toBeVisible();
});

test('Settings → Statistics: the page is reachable on the address and the way back is Settings', async ({ page }) => {
  await login(page, 'statistics');
  await page.goto('/settings/statistics');
  await expect(page.getByRole('tab', { name: 'Patient statistics' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/settings$/);
});
