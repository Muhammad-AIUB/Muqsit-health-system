import type { Page } from '@playwright/test';
import {
  DIAGNOSIS, NAPA, addFieldLine, addMedicine, createPatient, expect, login, mobileLookup, newRxButton,
  padRow, printDialog, saveAndOpenSheet, settle, test, uniqueMobile,
} from './helpers';

// "Add Bulk Medicine": a medicine this doctor prescribed on one visit is
// offered on the next, with the dose and duration they wrote, and one tick puts
// it on the pad. Real browser, real API, throwaway database; the patients are
// made up.

const plus = (page: Page) => page.getByRole('button', { name: 'Add Bulk Medicine' });
const bulkBox = (page: Page) => page.getByRole('dialog', { name: 'Add Bulk Medicine' });
const napaRow = (page: Page) =>
  bulkBox(page).getByRole('checkbox', { name: new RegExp(NAPA.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });

test('a medicine prescribed before is added to the next prescription from the + box, with its dose', async ({ page }) => {
  await login(page, 'bulkMed');

  // The list is the doctor's own history: before any prescription it is empty.
  await createPatient(page, uniqueMobile(), 'Bulk First Patient');
  await expect(plus(page)).toHaveAttribute('title', 'Add Bulk Medicine');
  await plus(page).click();
  await expect(bulkBox(page).getByText('No medicines yet')).toBeVisible();
  await expect(bulkBox(page).getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  await bulkBox(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(bulkBox(page)).toBeHidden();
  // Closing gives the keyboard back to the + (which saves nothing).
  await expect(plus(page)).toBeFocused();

  // Visit 1: prescribe it by hand and save.
  await addMedicine(page, 0, NAPA);
  await addFieldLine(page, 'Final diagnosis', DIAGNOSIS);
  await saveAndOpenSheet(page);
  await printDialog(page).getByRole('button', { name: 'Close', exact: true }).click();
  await expect(printDialog(page)).toBeHidden();

  // Visit 2, another patient: the medicine is in the box with what was written.
  await newRxButton(page).click();
  await expect(mobileLookup(page)).toBeVisible();
  await createPatient(page, uniqueMobile(), 'Bulk Second Patient');
  await expect(padRow(page, 0).locator('input').first()).toHaveValue('');

  await plus(page).click();
  await expect(napaRow(page)).toBeVisible();
  await expect(bulkBox(page)).toContainText(`${NAPA.dose} · ${NAPA.duration}`);
  await expect(bulkBox(page)).toContainText('1 patient');

  // The keyboard stays in the box, and Escape closes it without adding.
  await page.keyboard.press('Escape');
  await expect(bulkBox(page)).toBeHidden();
  await expect(padRow(page, 0).locator('input').first()).toHaveValue('');

  await plus(page).click();
  await napaRow(page).check();
  await bulkBox(page).getByRole('button', { name: 'Add (1)' }).click();
  await expect(bulkBox(page)).toBeHidden();
  await settle(page);

  // On the pad: the name, the dose and the duration — typed by nobody.
  const line = padRow(page, 0);
  await expect(line.locator('input').first()).toHaveValue(NAPA.label);
  await expect(line.getByPlaceholder('dose')).toHaveValue(NAPA.dose);
  await expect(line.getByPlaceholder('duration')).toHaveValue(NAPA.duration);
  await expect(page.getByRole('status').filter({ hasText: '1 added' })).toBeVisible();

  // Asked again for the same medicine: it is not added a second time.
  await plus(page).click();
  await napaRow(page).check();
  await bulkBox(page).getByRole('button', { name: 'Add (1)' }).click();
  await expect(bulkBox(page)).toContainText('already on ℞');
  await bulkBox(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(bulkBox(page)).toBeHidden();
  await expect(padRow(page, 1).locator('input').first()).toHaveValue('');

  // And the visit saves as any other: one medicine line, as written.
  await addFieldLine(page, 'Final diagnosis', DIAGNOSIS);
  const sheet = await saveAndOpenSheet(page);
  const body = sheet.locator('.sheet').first();
  await expect(body).toContainText('Bulk Second Patient');
  await expect(body).toContainText(NAPA.label);
  await expect(body).toContainText(NAPA.dose);
  await expect(body).toContainText(NAPA.duration);
});
