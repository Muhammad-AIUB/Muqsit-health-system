import {
  API_URL, DIAGNOSIS, NAPA, addFieldLine, addMedicine, apiPatientsByMobile, apiPrescriptions,
  createPatient, expect, login, mobileLookup, padTypingLine, printDialog, saveAndOpenSheet,
  saveAndPrint, test, uniqueMobile, waitForSheet,
} from './helpers';
import type { Page } from '@playwright/test';

/** Patient + one medicine + a final diagnosis, ready to be saved. */
async function writeVisit(page: Page, name: string) {
  const mobile = uniqueMobile();
  await createPatient(page, mobile, name);
  await addMedicine(page, 0, NAPA);
  await addFieldLine(page, 'Final diagnosis', DIAGNOSIS);
  return mobile;
}

/** Exactly one patient on the number, exactly one prescription on the patient. */
async function expectOneSavedRow(page: Page, mobile: string, name: string) {
  const patients = await apiPatientsByMobile(page, mobile);
  expect(patients.map((p) => p.name)).toEqual([name]);
  const rows = await apiPrescriptions(page, patients[0].id);
  expect(rows, 'prescription rows for this patient').toHaveLength(1);
  expect(rows[0].finalDiagnosis).toEqual([DIAGNOSIS]);
  expect(rows[0].items).toHaveLength(1);
  expect(rows[0].items[0]).toMatchObject({
    drug: NAPA.label, dose: NAPA.dose, duration: NAPA.duration, instruction: '', isNote: false, isCont: false,
  });
  return rows[0];
}

test.describe('writing a prescription', () => {
  test('the editor is gated until a patient is chosen', async ({ page }) => {
    await login(page, 'rxGate');

    // Closed: the editor is drawn but takes no pointer input, and nothing can be saved.
    const pad = padTypingLine(page);
    await expect(pad).toBeVisible();
    expect(await pad.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    await expect(saveAndPrint(page)).toBeDisabled();
    await expect(saveAndPrint(page)).toHaveAttribute('title', 'Select a patient (enter a mobile number) first');
    await expect(page.getByRole('button', { name: 'Save to complete later' })).toBeDisabled();

    await createPatient(page, uniqueMobile(), 'Gate Test Patient');

    // Open: the same line now takes input and Save is offered.
    expect(await pad.evaluate((el) => getComputedStyle(el).pointerEvents)).not.toBe('none');
    await expect(saveAndPrint(page)).toBeEnabled();
    await addMedicine(page, 0, NAPA);
  });

  // Was DEFECT-E2, fixed 2026-10-06. The gate stopped the mouse only:
  // PatientGate.tsx closed the editor with `pointer-events: none`, which the
  // keyboard ignores, so Tab from the mobile field walked into the blurred editor
  // and what was typed there landed in the ℞ pad with no patient chosen. The
  // closed gate is `inert` now. This stays as the regression test of the
  // component's own rule: "nothing can be written on the prescription until a
  // patient is chosen".
  test('the gated editor cannot be typed into from the keyboard either', async ({ page }, testInfo) => {
    await login(page, 'gateKeyboard');
    await expect(padTypingLine(page)).toBeVisible();

    await mobileLookup(page).focus();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const inPad = await page.evaluate(
        () => document.activeElement?.getAttribute('placeholder')?.startsWith('Start typing') ?? false,
      );
      if (inPad) break;
    }
    await page.keyboard.type('Napa', { delay: 120 });

    await testInfo.attach('gated-pad-after-typing', { body: await page.screenshot(), contentType: 'image/png' });

    // With no patient chosen, no ℞ line may hold text.
    const written = await page
      .locator('[data-rx-row] input')
      .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value).filter(Boolean));
    expect(written, 'text typed into the ℞ pad while the gate is closed').toEqual([]);
  });

  test('new patient → medicine → diagnosis → Save & print shows the sheet and stores one row', async ({ page }) => {
    await login(page, 'rxSave');
    const name = 'Save Test Patient';
    const mobile = await writeVisit(page, name);

    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url() === `${API_URL}/prescriptions`) posts.push(r.url());
    });

    const sheet = await saveAndOpenSheet(page);

    // The printed document: what was entered, and nothing the system inferred.
    const body = sheet.locator('.sheet').first();
    await expect(body).toContainText(name);
    await expect(body).toContainText(mobile);
    await expect(body).toContainText(NAPA.label);
    await expect(body).toContainText(NAPA.dose);
    await expect(body).toContainText(NAPA.duration);
    await expect(body).toContainText(DIAGNOSIS);
    await expect(sheet.getByRole('alert')).toHaveCount(0);
    await expect(sheet.locator('[class*="rx-alert"]')).toHaveCount(0);
    await expect(printDialog(page).getByRole('button', { name: /Print \/ Save as PDF/ })).toBeEnabled();

    // Persistence, read back through the API rather than the screen.
    expect(posts).toHaveLength(1);
    await expectOneSavedRow(page, mobile, name);
  });

  test('a double-click on Save & print stores one row, not two', async ({ page }) => {
    await login(page, 'rxDouble');
    const name = 'Double Click Patient';
    const mobile = await writeVisit(page, name);

    await saveAndPrint(page).dblclick();
    await waitForSheet(page);

    await expectOneSavedRow(page, mobile, name);
  });

  test('two presses landing before the first re-render store one row', async ({ page }) => {
    // A real double-press can deliver both clicks before React has drawn the
    // sheet over the button; `dblclick()` above may have its second click land
    // on the sheet instead. Two activations in one task reach the in-flight
    // guard itself (PrescriptionView's `savingRef`).
    await login(page, 'rxDoubleSync');
    const name = 'Double Press Patient';
    const mobile = await writeVisit(page, name);

    await saveAndPrint(page).evaluate((b) => {
      (b as HTMLButtonElement).click();
      (b as HTMLButtonElement).click();
    });
    await waitForSheet(page);

    await expectOneSavedRow(page, mobile, name);
  });

  test('a prescribing alert shown while writing is not on the printed sheet', async ({ page }) => {
    // Nothing clinical is typed: "Barcavir" is a row of the seeded test
    // medicines table and "CKD" is one of the app's own Associated-illness
    // quick-picks. The alert text is read off the screen, never written here.
    await login(page, 'rxAlert');
    const name = 'Alert Test Patient';
    const mobile = uniqueMobile();
    await createPatient(page, mobile, name);
    await addMedicine(page, 0, { search: 'Barcavir', label: 'Tablet. Barcavir 0.5 mg', dose: NAPA.dose });

    await page.getByText('Associated illness', { exact: true }).click();
    await page.getByLabel('CKD', { exact: true }).check();
    await page.getByRole('button', { name: 'Done', exact: true }).click();

    // On screen: the warning under its own medicine.
    const bubble = page.getByRole('alert').first();
    await expect(bubble).toBeVisible();
    const alertLines = (await bubble.innerText())
      .split('\n')
      .map((l) => l.replace('⚠️', '').trim())
      .filter((l) => l.length > 15);
    expect(alertLines.length, 'the alert carries advice text').toBeGreaterThan(0);

    const sheet = await saveAndOpenSheet(page);
    const body = sheet.locator('.sheet').first();
    await expect(body).toContainText('Tablet. Barcavir 0.5 mg');
    await expect(body).toContainText('CKD');
    const printed = await body.innerText();
    for (const line of alertLines) expect(printed).not.toContain(line);
    await expect(sheet.getByRole('alert')).toHaveCount(0);
    await expect(sheet.locator('[class*="rx-alert"]')).toHaveCount(0);

    // And the saved record carries the medicine and the condition, as entered.
    const [patient] = await apiPatientsByMobile(page, mobile);
    const rows = await apiPrescriptions(page, patient.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].associatedIllness).toEqual(['CKD']);
    expect(rows[0].items.map((i) => i.drug)).toEqual(['Tablet. Barcavir 0.5 mg']);
    expect(JSON.stringify(rows[0])).not.toContain(alertLines[0]);
  });
});
