import { NAPA, addMedicine, createPatient, expect, login, padRow, saveAndOpenSheet, settle, test, uniqueMobile } from './helpers';

// ⚕️ A `>>>` line belongs to the medicine line directly above it. Before
// 18/10/2026, clearing that medicine's name left its `>>>` dose standing under
// the medicine BEFORE it: Save & print filled that medicine's name in and
// printed the dose under it — a dose for the wrong drug (physician: "dangerous
// bug"). Now a medicine that has `>>>` lines keeps its name: emptied and left,
// the name comes back and the pad says how to remove or change it — and the
// sheet prints the `>>>` dose under its own medicine. (A line that cannot be
// written, from data saved before this, is refused at Save: unit tests.)
// Real browser, real API, throwaway database; the patient is made up.

const BARCAVIR = { search: 'Barcavir', label: 'Tablet. Barcavir 0.5 mg', dose: '1+0+0' };

test('a medicine with a >>> dose keeps its name, and the dose prints under it', async ({ page }) => {
  await login(page, 'taperOrphan');
  await createPatient(page, uniqueMobile(), 'Taper Orphan Patient');

  await addMedicine(page, 0, NAPA);
  await addMedicine(page, 1, BARCAVIR);
  // A tapering line under Barcavir.
  await page.getByTitle('Add subsequent dose and duration for this drug').nth(1).click();
  await settle(page);
  await padRow(page, 2).getByPlaceholder('dose').fill('0+0+1');
  await padRow(page, 2).getByPlaceholder('dose').blur();
  await settle(page);

  // Barcavir's name is emptied and the box left: it comes back, and the pad says why.
  const name = padRow(page, 1).locator('input').first();
  await name.fill('');
  await name.blur();
  await settle(page);
  await expect(name).toHaveValue(BARCAVIR.label);
  await expect(page.getByRole('status').filter({ hasText: 'keeps its name' })).toBeVisible();

  // The sheet prints the >>> dose under Barcavir — never under Napa.
  const sheet = await saveAndOpenSheet(page);
  // The ℞ table's own rows, in order: a medicine row has `.rx-name`, a >>> row `.rx-cont`.
  const rxRows = sheet.locator('.sheet').first().locator('tr:not(:has(tr)):has(.rx-name), tr:not(:has(tr)):has(.rx-cont)');
  const texts = (await rxRows.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  const taperAt = texts.findIndex((t) => t.includes('0+0+1'));
  expect(taperAt, texts.join(' | ')).toBeGreaterThan(0);
  expect(texts[taperAt - 1]).toContain('Barcavir');
  expect(texts[taperAt - 1]).not.toContain('Napa');
});
