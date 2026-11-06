import type { Page } from '@playwright/test';
import { API_URL, apiPatientsByMobile, createPatient, expect, login, mobileLookup, test, uniqueMobile } from './helpers';

// Drug history as a table on "Patient's Prescriptions and reports" (physician's
// sheet, 07/11/2026): the columns, Current medication first, a start date or a
// duration put right and kept on the record — and the Health-trend chart
// drawing the same course. Real browser, real API, throwaway database; the
// patient and the dates are made up. Only what cannot change with the day the
// suite runs is asserted as Current: a Continue is always current, a course
// of 2025 never is.

const DENVAR = '06/11/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 7 days';
const CEF3 = '01/02/2025: Capsule. Cef 3 400 mg — 1+0+1 —  — 14 days';
const AMLO = '01/01/2026: Tablet. Amlodipine 5 mg — 1+0+0 —  — Continue';
const TAPER = [
  '10/03/2026: Tablet. Prednisolone 10 mg — 2+2+0 — After meal — 5 days',
  '10/03/2026(cont): 2+1+0 — After meal — 5 days',
];

async function openRecords(page: Page, mobile: string, name: string) {
  await mobileLookup(page).fill(mobile);
  await page.getByRole('button', { name: new RegExp(`^${name} ${mobile}`) }).click();
  await expect(page.getByPlaceholder('Patient name')).toHaveValue(name);
  await page.getByRole('button', { name: /Patient's Prescriptions and reports/ }).click();
}

const section = (page: Page) => page.getByRole('region', { name: 'Drug history' });
const rowOf = (page: Page, text: string) => section(page).getByRole('row').filter({ hasText: text }).first();

test('the Drug history table works out End and Total, lists Current first, and a corrected duration stays on the record and moves the chart', async ({ page }) => {
  await login(page, 'drugTable');
  const mobile = uniqueMobile();
  await createPatient(page, mobile, 'Table Patient');
  const [p] = await apiPatientsByMobile(page, mobile);
  const kept = await page.request.patch(`${API_URL}/patients/${p.id}`, { data: { drugHistory: [CEF3, DENVAR, AMLO, ...TAPER] } });
  expect(kept.status(), await kept.text()).toBe(200);
  await page.reload();

  await openRecords(page, mobile, 'Table Patient');

  // The six columns, in the physician's order.
  const table = section(page).getByRole('table', { name: 'Drug history' });
  await expect(table.getByRole('columnheader')).toHaveText(['Drug name', 'Dose', 'Duration', 'Start date', 'End date', 'Total number']);

  // Worked out from what was stored — and nothing but that.
  await expect(rowOf(page, 'Cef 3')).toContainText('01/02/2025');
  await expect(rowOf(page, 'Cef 3')).toContainText('15/02/2025'); // 14 days later
  await expect(rowOf(page, 'Cef 3')).toContainText('28'); // 2 a day for 14 days
  await expect(rowOf(page, 'Denvar')).toContainText('13/11/2026');
  await expect(rowOf(page, 'Denvar')).toContainText('14');
  // A regimen: End after the last line, Total of both lines (4×5 + 3×5).
  await expect(rowOf(page, 'Prednisolone')).toContainText('20/03/2026');
  await expect(rowOf(page, 'Prednisolone')).toContainText('35');
  // Continue has no End.
  await expect(rowOf(page, 'Amlodipine')).toContainText('Continue');

  // Current medication first: Continue is current whatever the day; a 2025 course never is.
  await expect(section(page).getByText('Current medication', { exact: true })).toBeVisible();
  const order = await table.getByRole('row').allTextContents();
  const at = (text: string) => order.findIndex((t) => t.includes(text));
  expect(at('Amlodipine')).toBeGreaterThan(at('Current medication'));
  expect(at('Earlier medication')).toBeGreaterThan(at('Amlodipine'));
  expect(at('Cef 3')).toBeGreaterThan(at('Earlier medication'));

  // Sort by generic keeps Current first.
  await section(page).getByRole('button', { name: 'Generic' }).click();
  await expect(section(page).getByRole('button', { name: 'Generic' })).toHaveAttribute('aria-pressed', 'true');
  const byGeneric = await table.getByRole('row').allTextContents();
  expect(byGeneric.findIndex((t) => t.includes('Earlier medication'))).toBeGreaterThan(byGeneric.findIndex((t) => t.includes('Amlodipine')));

  // Edit: a duration put right; the shorthand is written out; nothing is saved until Save.
  await section(page).getByRole('button', { name: '✎ Edit' }).click();
  const box = section(page).getByLabel(/Duration of Capsule\. Denvar/);
  await box.fill('5d');
  await box.blur();
  await expect(box).toHaveValue('5 days');
  await expect(section(page).getByText('Not saved yet').first()).toBeVisible();
  const before = await page.request.get(`${API_URL}/patients/${p.id}`);
  expect(((await before.json()) as { drugHistory: string[] }).drugHistory).toContain(DENVAR);
  // The editor's own draft is written a moment after the list changes. It must
  // carry the corrected line before a reload, or the draft's older copy of the
  // list would come back beside the record's (the app's merge keeps what the
  // draft holds that the record does not).
  const draftHasIt = page.waitForResponse((r) => r.url().includes('/prescription-draft') && r.request().method() === 'PUT'
    && (r.request().postData() ?? '').includes('Capsule. Denvar 400 mg — 1+0+1 —  — 5 days'));
  await section(page).getByRole('button', { name: /Save changes to Capsule\. Denvar/ }).click();
  await expect(section(page).getByText('Not saved yet')).toHaveCount(0);
  await draftHasIt;

  // On the record — the same lines, the one block changed in place.
  const after = await page.request.get(`${API_URL}/patients/${p.id}`);
  expect(((await after.json()) as { drugHistory: string[] }).drugHistory).toEqual([
    CEF3, '06/11/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 5 days', AMLO, ...TAPER,
  ]);
  await expect(rowOf(page, 'Denvar')).toContainText('11/11/2026');
  await expect(rowOf(page, 'Denvar')).toContainText('10');
  await section(page).getByRole('button', { name: 'Done' }).click();

  // Kept across a reload (the patient and the records page come back as they were).
  await page.reload();
  await expect(page.getByPlaceholder('Patient name')).toHaveValue('Table Patient');
  await expect(rowOf(page, 'Denvar')).toContainText('11/11/2026');

  // And the chart draws the same course: its medication list gives the range.
  await page.getByRole('button', { name: /Integrated health monitoring and overview/ }).click();
  // (A dot is a name recorded on one date only; a course with a readable duration is a bar.)
  await expect(page.locator('body')).toContainText(/06\/11\/2026\s*[–-]\s*11\/11\/2026/);
  await expect(page.locator('body')).toContainText(/01\/02\/2025\s*[–-]\s*15\/02\/2025/);
});

test('a line another device changed first is not written over — the doctor is told, and the record keeps the other change', async ({ page }) => {
  await login(page, 'drugTableStale'); // one seeded doctor per test: the first journey leaves a draft behind
  const mobile = uniqueMobile();
  await createPatient(page, mobile, 'Stale Patient');
  const [p] = await apiPatientsByMobile(page, mobile);
  await page.request.patch(`${API_URL}/patients/${p.id}`, { data: { drugHistory: [DENVAR] } });
  await page.reload();
  await openRecords(page, mobile, 'Stale Patient');

  await section(page).getByRole('button', { name: '✎ Edit' }).click();
  await section(page).getByLabel(/Duration of Capsule\. Denvar/).fill('9 days');
  // Another device puts the same line right first.
  const other = '06/11/2026: Capsule. Denvar 400 mg — 1+0+1 —  — 3 days';
  const done = await page.request.patch(`${API_URL}/patients/${p.id}/drug-history`, { data: { replace: [DENVAR], replacement: [other] } });
  expect(done.status(), await done.text()).toBe(200);

  await section(page).getByRole('button', { name: /Save changes to Capsule\. Denvar/ }).click();
  const box = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await expect(box).toContainText('nothing was changed');
  await page.keyboard.press('Escape');
  const stored = await (await page.request.get(`${API_URL}/patients/${p.id}`)).json() as { drugHistory: string[] };
  expect(stored.drugHistory).toEqual([other]); // the other device's change, not ours over it
});
