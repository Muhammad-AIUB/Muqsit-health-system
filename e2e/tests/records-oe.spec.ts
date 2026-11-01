import { API_URL, apiPatientsByMobile, createPatient, expect, login, mobileLookup, seed, test, uniqueMobile } from './helpers';

// The records page (physician's sheets 28/10 item 7, 31/10 item 3): each
// On-examination date says who wrote it, there is no Edit, Download is in its
// place, and the history sections follow the Investigation summary. Real
// browser, real API, throwaway database; names made up.

test('On examination names its author on the records page; the history sections follow', async ({ page }) => {
  await login(page, 'recordsOe');
  const mobile = uniqueMobile();
  await createPatient(page, mobile, 'Records Patient');
  const [p] = await apiPatientsByMobile(page, mobile);

  // A saved visit's findings, appended through the route Save & print uses.
  const res = await page.request.post(`${API_URL}/patients/${p.id}/on-examination`, {
    data: { entries: [{ date: '28/10/2026', text: 'BP: 120/80 mmHg' }, { date: '28/10/2026', text: 'Disease Hx: DM 10/01/2020' }] },
  });
  expect(res.status()).toBe(201);
  // The page shows the history as loaded with the patient: open them again.
  await page.reload();
  await mobileLookup(page).fill(mobile);
  await page.getByRole('button', { name: new RegExp(`^Records Patient ${mobile}`) }).click();
  await expect(page.getByPlaceholder('Patient name')).toHaveValue('Records Patient');

  await page.getByRole('button', { name: /Patient's Prescriptions and reports/ }).click();
  const name = seed().doctors.recordsOe.name;
  await expect(page.getByText(`by Dr. ${name}`).first()).toBeVisible();
  await expect(page.getByText('BP: 120/80 mmHg')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download On examination' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '✎ Edit' })).toHaveCount(0);

  const sections = page.getByRole('region');
  await expect(sections).toHaveText([/Drug history/, /Patient's input/, /Disease and surgical history/, /Chief complaints history/, /Diagnosis history/]);
  await expect(page.getByRole('region', { name: 'Disease and surgical history' })).toContainText('DM 10/01/2020');
});
