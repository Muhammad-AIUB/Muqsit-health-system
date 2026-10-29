import type { Page } from '@playwright/test';
import { API_URL, expect, login, test } from './helpers';

// ⚕️ What the IPD sheet's Save says when a save does not happen (20/10/2026) —
// the rule the OPD Save buttons have kept since 18/10/2026. The line beside
// Save said "Save failed" with no reason for 2.5 s, its colour was picked by
// comparing its text with "Saved!", and "Save follow up" moved the typed vitals
// into the log at the press — where a save that failed left them looking
// recorded. Real browser, real API, throwaway database; the request is dropped
// or failed by the test, the admission is made up.

/** What a CSS colour variable of the app's palette resolves to on this page. */
const resolved = (page: Page, cssVar: string) => page.evaluate((v) => {
  const probe = document.createElement('span');
  probe.style.color = `var(${v})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}, cssVar);

interface ApiAdmission { id: string; name: string; age: number | null; clinical: { followUps?: { bp?: string }[] } | null }
const apiAdmission = async (page: Page, id: string): Promise<ApiAdmission> => {
  const res = await page.request.get(`${API_URL}/ipd`);
  expect(res.status(), 'GET /ipd').toBe(200);
  const found = ((await res.json()) as ApiAdmission[]).find((a) => a.id === id);
  if (!found) throw new Error(`admission ${id} is not in GET /ipd`);
  return found;
};

const NOT_SAVED = 'The changes to this admission were not saved.';

test('the IPD sheet says a save that did not happen in a box, and a follow-up is logged only once the server has it', async ({ page }) => {
  await login(page, 'ipdSaveFailed');
  // Made up through the API: the admit form is not what this journey is about.
  const created = await page.request.post(`${API_URL}/ipd`, { data: { bed: 'E2E-1', name: 'IPD Save Patient' } });
  expect(created.status(), 'POST /ipd').toBe(201);
  const { id } = (await created.json()) as { id: string };

  await page.goto('/ipd');
  await page.getByRole('button', { name: 'Open' }).click();
  const bp = page.getByLabel('Blood pressure');
  await bp.fill('90/60');

  // The request is dropped: a box, in the doctor's words, and the vitals stay
  // in their box — not in the log, where they would read as recorded.
  const sheetPatch = `${API_URL}/ipd/${id}`;
  await page.route(sheetPatch, (route) =>
    route.request().method() === 'PATCH' ? route.abort('internetdisconnected') : route.continue());
  await page.getByRole('button', { name: 'Save follow up' }).click();
  const box = page.getByRole('alertdialog', { name: NOT_SAVED });
  await expect(box).toContainText('Check your internet connection and try again.');
  await expect(box).toContainText('Everything you wrote is still here.');
  await expect(box).not.toContainText('API');
  await box.getByRole('button', { name: 'OK' }).click();
  await expect(box).toBeHidden();
  await expect(bp).toHaveValue('90/60');
  await expect(page.getByText('BP 90/60')).toHaveCount(0);
  await expect(page.getByText(/Save failed/)).toHaveCount(0);
  expect((await apiAdmission(page, id)).clinical?.followUps ?? []).toEqual([]);

  // The connection is back: the same press records it once, the boxes empty,
  // the log shows it, and the line says so in the saved green.
  await page.unroute(sheetPatch);
  const green = await resolved(page, '--c-ok-600');
  await page.getByRole('button', { name: 'Save follow up' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved!' })).toHaveCSS('color', green);
  await expect(page.getByText('BP 90/60')).toHaveCount(1);
  await expect(bp).toHaveValue('');
  const saved = (await apiAdmission(page, id)).clinical?.followUps ?? [];
  expect(saved.map((f) => f.bp)).toEqual(['90/60']);

  // The server fails the top Save: its own words are not shown, and what was
  // typed stays.
  const age = page.getByPlaceholder('—').first();
  await age.fill('40');
  await page.route(sheetPatch, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"statusCode":500,"message":"Internal server error"}' })
      : route.continue());
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(box).toContainText('The server could not save it just now. Please try again in a moment.');
  await expect(box).not.toContainText('Internal server error');
  await box.getByRole('button', { name: 'OK' }).click();
  await expect(age).toHaveValue('40');
  expect((await apiAdmission(page, id)).age).toBeNull();
});
