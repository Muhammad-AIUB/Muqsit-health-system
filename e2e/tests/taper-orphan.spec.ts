import { API_URL, NAPA, addMedicine, apiPatientsByMobile, apiPrescriptions, createPatient, expect, login, newRxButton, padRow, printDialog, saveAndOpenSheet, saveAndPrint, settle, test, uniqueMobile } from './helpers';

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

// A line with a dose and no medicine name — here a medicine's name cleared and
// its dose left — cannot be written. The pad marks it, and Save & print,
// Preview PDF and Save to complete later refuse; nothing is saved. This holds
// what the unit tests cannot: the pad's count reaching the editor
// (RightColumn), and the buttons reading it (PrescriptionView) — third and
// fourth reviews, 18/10/2026.
test('a line with a dose and no medicine name is refused by Save & print, Preview PDF and Save to complete later', async ({ page }) => {
  // A doctor of its own: the journey above saves Barcavir, and "Your usual"
  // would then offer it beside the medicine list.
  await login(page, 'taperRefused');
  const mobile = uniqueMobile();
  await createPatient(page, mobile, 'Nameless Dose Patient');

  await addMedicine(page, 0, NAPA);
  await addMedicine(page, 1, BARCAVIR);
  const name = padRow(page, 1).locator('input').first();
  await name.fill('');
  await name.blur();
  await settle(page);
  await expect(page.getByRole('status').filter({ hasText: 'no medicine name' })).toBeVisible();

  await saveAndPrint(page).click();
  const refused = page.getByRole('alertdialog', { name: 'The prescription was not saved.' });
  await expect(refused).toContainText('has no medicine name');
  await refused.getByRole('button', { name: 'OK' }).click();
  await expect(refused).toBeHidden();
  await expect(printDialog(page)).toBeHidden();

  await page.getByRole('button', { name: 'Preview PDF' }).click();
  const notYet = page.getByRole('alertdialog', { name: 'The prescription cannot be previewed yet.' });
  await expect(notYet).toBeVisible();
  await notYet.getByRole('button', { name: 'OK' }).click();
  await expect(printDialog(page)).toBeHidden();

  // "Save to complete later" clears the editor once the draft is stored: it
  // refuses too, and the line is still there to put right.
  await page.getByRole('button', { name: 'Save to complete later' }).click();
  const notParked = page.getByRole('alertdialog', { name: 'The visit was not saved for later.' });
  await expect(notParked).toBeVisible();
  await notParked.getByRole('button', { name: 'OK' }).click();
  await expect(padRow(page, 1).getByPlaceholder('dose')).toHaveValue(BARCAVIR.dose);

  const [patient] = await apiPatientsByMobile(page, mobile);
  expect(await apiPrescriptions(page, patient.id)).toEqual([]);
});

// ⚕️ 19/10/2026: such a line is never in the prescription's items, and it lived
// in the pad's rows alone — a reload drew the pad without it, and nothing said
// so. It is now held with the visit (client/src/lib/rxPadHold.ts) and comes
// back with the draft: still red, still refused. This holds what the unit tests
// cannot: the real auto-save and the real reload, in a real browser.
test('a line with a dose and no medicine name comes back after a reload, still refused', async ({ page }) => {
  await login(page, 'taperHeld');
  const mobile = uniqueMobile();
  await createPatient(page, mobile, 'Held Line Patient');

  await addMedicine(page, 0, NAPA);
  await addMedicine(page, 1, BARCAVIR);
  // The debounced auto-save that carries the held line. Armed before the edit.
  const heldSaved = page.waitForResponse((r) => r.url() === `${API_URL}/prescription-draft`
    && r.request().method() === 'PUT' && r.ok()
    && (r.request().postData() ?? '').includes('"rxPadHeld":['), { timeout: 60_000 });
  const name = padRow(page, 1).locator('input').first();
  await name.fill('');
  await name.blur();
  await settle(page);
  await expect(page.getByRole('status').filter({ hasText: 'no medicine name' })).toBeVisible();
  await heldSaved;

  await page.reload();
  await expect(newRxButton(page)).toBeVisible();
  await expect(padRow(page, 0).locator('input').first()).toHaveValue(NAPA.label);
  await expect(padRow(page, 1).locator('input').first()).toHaveValue('');
  await expect(padRow(page, 1).getByPlaceholder('dose')).toHaveValue(BARCAVIR.dose);
  await expect(page.getByRole('status').filter({ hasText: 'no medicine name' })).toBeVisible();

  await saveAndPrint(page).click();
  const refused = page.getByRole('alertdialog', { name: 'The prescription was not saved.' });
  await expect(refused).toContainText('has no medicine name');
  await refused.getByRole('button', { name: 'OK' }).click();
  const [patient] = await apiPatientsByMobile(page, mobile);
  expect(await apiPrescriptions(page, patient.id)).toEqual([]);
});
