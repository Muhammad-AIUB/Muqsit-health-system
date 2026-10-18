import { API_URL, NAPA, addMedicine, createPatient, expect, login, padRow, printDialog, saveAndPrint, settle, test, uniqueMobile } from './helpers';

// ⚕️ A `>>>` line belongs to the medicine line directly above it. Before
// 18/10/2026, clearing that medicine's name left its `>>>` dose standing under
// the medicine BEFORE it: Save & print filled that medicine's name in and
// printed the dose under it — a dose for the wrong drug (physician: "dangerous
// bug"). Now the pad marks the line, and Save & print refuses and says why.
// Real browser, real API, throwaway database; the patient is made up.

const BARCAVIR = { search: 'Barcavir', label: 'Tablet. Barcavir 0.5 mg', dose: '1+0+0' };

test('a >>> dose whose medicine name was cleared is never saved or printed under the medicine above', async ({ page }) => {
  await login(page, 'taperOrphan');
  await createPatient(page, uniqueMobile(), 'Taper Orphan Patient');

  await addMedicine(page, 0, NAPA);
  await addMedicine(page, 1, BARCAVIR);
  // A tapering line under Barcavir.
  await page.getByTitle('Add subsequent dose and duration for this drug').nth(1).click();
  await settle(page);
  await padRow(page, 2).getByPlaceholder('dose').fill('0+0+1');
  await settle(page);

  // Barcavir's name is cleared; its >>> dose stays.
  const name = padRow(page, 1).locator('input').first();
  await name.fill('');
  await name.blur();
  await settle(page);

  // The pad says, on the line, what is wrong.
  await expect(page.getByRole('alert').filter({ hasText: 'no medicine above it' })).toBeVisible();

  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url() === `${API_URL}/prescriptions`) posts.push(r.url());
  });
  await saveAndPrint(page).click();

  // Refused, in words — no sheet, nothing stored.
  await expect(page.getByText('The prescription was not saved.')).toBeVisible();
  await expect(printDialog(page)).toBeHidden();
  expect(posts).toEqual([]);
});
