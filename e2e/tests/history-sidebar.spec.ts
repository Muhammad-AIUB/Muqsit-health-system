import { API_URL, apiPatientsByMobile, createPatient, expect, login, mobileLookup, test, uniqueMobile } from './helpers';

// Physician's sheet 28/10/2026, item 7: Disease / Surgical history under the
// sidebar's History row, kept for the patient, removed softly with Undo, and
// gone from the On-examination popup. Real browser, real API, throwaway
// database; names made up.

test('History: the patient\'s disease / surgical history is added, kept across a reload, removed with Undo', async ({ page }) => {
  await login(page, 'historySidebar');
  const mobile = uniqueMobile();
  await createPatient(page, mobile, 'History Patient');
  const [p] = await apiPatientsByMobile(page, mobile);

  const hx = page.getByTestId('patient-history');
  await hx.getByLabel('Disease history', { exact: true }).fill('DM');
  await hx.getByLabel('Disease history date').fill('010110');
  await hx.getByRole('button', { name: 'Add disease history' }).click();
  await expect(page.getByTestId('hx-disease').locator('li')).toHaveText([/DM 01\/01\/2010/]);
  await hx.getByLabel('Surgical / intervention history', { exact: true }).fill('H/O cholecystectomy');
  await hx.getByLabel('Surgical / intervention history', { exact: true }).press('Enter');
  await expect(page.getByTestId('hx-surgical').locator('li')).toHaveText([/H\/O cholecystectomy/]);

  // Kept for the patient: a reload and the patient opened again.
  await page.reload();
  await mobileLookup(page).fill(mobile);
  await page.getByRole('button', { name: new RegExp(`^History Patient ${mobile}`) }).click();
  await expect(page.getByTestId('hx-disease').locator('li')).toHaveText([/DM 01\/01\/2010/]);

  // × asks, removes, Undo puts back.
  await page.getByRole('button', { name: 'Remove "DM 01/01/2010"' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByTestId('hx-disease').locator('li')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('hx-disease').locator('li')).toHaveText([/DM 01\/01\/2010/]);

  // The record holds it as the shared history's lines.
  const rec = await (await page.request.get(`${API_URL}/patients/${p.id}`)).json();
  expect(rec.onExaminationSummary.map((e: { text: string }) => e.text)).toEqual([
    'Disease Hx: DM 01/01/2010', 'Surgical Hx: H/O cholecystectomy',
  ]);

  // ⊘ Hide is there, off by default.
  await expect(page.getByRole('button', { name: 'Hide History in printed prescription' })).toHaveAttribute('aria-pressed', 'false');
});
