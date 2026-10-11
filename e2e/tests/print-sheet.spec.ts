import {
  API_URL, DIAGNOSIS, NAPA, addFieldLine, addMedicine, apiPatientsByMobile, apiPrescriptions,
  createPatient, expect, login, printDialog, printFrame, saveAndOpenSheet, saveAndPrint,
  settle, test, uniqueMobile, waitForSheet,
} from './helpers';
import type { Page } from '@playwright/test';

// The print sheet and the header's switch, with a REAL keyboard and real focus.
//
// The unit tests hold these rules in jsdom, where an <iframe> has no focus of
// its own, Tab moves nothing and a closed popup's focus goes wherever the test
// puts it. What a doctor's browser does is the thing that matters, and one of
// these rules guards the record itself: the focus must never be left on the
// button that SAVES (review before release, 2026-10-12).

/** Patient + one medicine + a final diagnosis, ready to be saved. */
async function writeVisit(page: Page, name: string) {
  const mobile = uniqueMobile();
  await createPatient(page, mobile, name);
  await addMedicine(page, 0, NAPA);
  await addFieldLine(page, 'Final diagnosis', DIAGNOSIS);
  return mobile;
}

async function expectOneRow(page: Page, mobile: string) {
  const [patient] = await apiPatientsByMobile(page, mobile);
  expect(await apiPrescriptions(page, patient.id), 'prescription rows for this patient').toHaveLength(1);
}

/** Counts POSTs that would each be a new Prescription row. */
function countSaves(page: Page) {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url() === `${API_URL}/prescriptions`) posts.push(r.url());
  });
  return posts;
}

const closeButton = (page: Page) => printDialog(page).getByRole('button', { name: 'Close', exact: true });
const printButton = (page: Page) => printDialog(page).getByRole('button', { name: /Print \/ Save as PDF/ });
const previewPdf = (page: Page) => page.getByRole('button', { name: 'Preview PDF', exact: true });
/** What holds the focus in the app's own document ("IFRAME" = it is inside the sheet). */
const focused = (page: Page) => page.evaluate(() => document.activeElement?.tagName ?? '');

// The browser's print dialog is native UI no test can drive, so `print` is
// counted instead — on the sheet's own window, and on the app's, which must
// never be the one that prints while the sheet is open.
async function countPrints(page: Page) {
  await printFrame(page).locator('body').evaluate(() => {
    const w = window as unknown as { __printed: number; print: () => void };
    w.__printed = 0;
    w.print = () => { w.__printed += 1; };
  });
  await page.evaluate(() => {
    const w = window as unknown as { __printed: number; print: () => void };
    w.__printed = 0;
    w.print = () => { w.__printed += 1; };
  });
  return {
    sheet: () => printFrame(page).locator('body').evaluate(() => (window as unknown as { __printed: number }).__printed),
    app: () => page.evaluate(() => (window as unknown as { __printed: number }).__printed),
  };
}

test.describe('the print sheet and the keyboard', () => {
  test('after Save & print, closing the sheet leaves the focus off the button that saves', async ({ page }) => {
    await login(page, 'sheetSave');
    const mobile = await writeVisit(page, 'Sheet Focus Patient');
    const saves = countSaves(page);

    await saveAndOpenSheet(page);
    expect(saves).toHaveLength(1);

    // Closed with the mouse, as most doctors will.
    await closeButton(page).click();
    await expect(printDialog(page)).toBeHidden();
    await expect(saveAndPrint(page)).toBeEnabled();
    await expect(saveAndPrint(page)).not.toBeFocused();

    // Space scrolls a page and Enter is pressed without thinking. With the
    // focus on "Save & print" either would have filed the consultation again.
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await settle(page);
    await expect(printDialog(page)).toBeHidden();
    expect(saves, 'POST /prescriptions after Space and Enter').toHaveLength(1);

    // "Preview PDF" saves nothing, so its sheet DOES give the focus back —
    // pressing it again only shows the same sheet again.
    await previewPdf(page).click();
    await expect(printFrame(page).locator('.sheet').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(printDialog(page)).toBeHidden();
    await expect(previewPdf(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(printFrame(page).locator('.sheet').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(printDialog(page)).toBeHidden();

    expect(saves, 'POST /prescriptions in the whole journey').toHaveLength(1);
    await expectOneRow(page, mobile);
  });

  test('with the focus inside the sheet, the keys still belong to the sheet', async ({ page }) => {
    await login(page, 'sheetKeys');
    const mobile = await writeVisit(page, 'Sheet Keys Patient');
    const saves = countSaves(page);
    const sheet = await saveAndOpenSheet(page);
    const prints = await countPrints(page);

    // Into the sheet — where the focus always is after Print, or after a click
    // on the page to scroll it. A key pressed here never reaches the app.
    await sheet.locator('.sheet').first().click();
    expect(await focused(page)).toBe('IFRAME');

    // Ctrl+P prints the SHEET, not the app page with the sheet framed in it.
    await page.keyboard.press('Control+p');
    expect(await prints.sheet()).toBe(1);
    expect(await prints.app()).toBe(0);

    // Tab comes back to the sheet's own two buttons, then into the sheet again
    // — Print, Close, the sheet — and never out to the editor behind.
    await page.keyboard.press('Tab');
    await expect(printButton(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(closeButton(page)).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await focused(page)).toBe('IFRAME');
    await page.keyboard.press('Tab');
    await expect(printButton(page)).toBeFocused();
    // …and the same round backwards.
    await page.keyboard.press('Shift+Tab');
    expect(await focused(page)).toBe('IFRAME');
    await page.keyboard.press('Shift+Tab');
    await expect(closeButton(page)).toBeFocused();

    // From the buttons, Ctrl+P is still the sheet's.
    await page.keyboard.press('Control+p');
    expect(await prints.sheet()).toBe(2);
    expect(await prints.app()).toBe(0);

    // Escape pressed INSIDE the sheet closes it…
    await sheet.locator('.sheet').first().click();
    expect(await focused(page)).toBe('IFRAME');
    await page.keyboard.press('Escape');
    await expect(printDialog(page)).toBeHidden();
    // …and after a save, not onto the button that saves.
    await expect(saveAndPrint(page)).toBeEnabled();
    await expect(saveAndPrint(page)).not.toBeFocused();
    await page.keyboard.press('Enter');
    await settle(page);
    await expect(printDialog(page)).toBeHidden();

    expect(saves).toHaveLength(1);
    await expectOneRow(page, mobile);
  });

  test('saved and closed from the keyboard, with Enter held down on Close: still one row', async ({ page }) => {
    // The case the focus rule exists for. Enter on a button presses it on the
    // way DOWN, and a held key repeats: with the focus handed back to "Save &
    // print" as the sheet closed, the repeats pressed it again and again.
    await login(page, 'sheetEnter');
    const mobile = await writeVisit(page, 'Sheet Enter Patient');
    const saves = countSaves(page);

    await saveAndPrint(page).focus();
    await page.keyboard.press('Enter');
    await waitForSheet(page);
    expect(saves).toHaveLength(1);

    // The sheet has the keyboard: Tab to Print, Tab to Close.
    await page.keyboard.press('Tab');
    await expect(printButton(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(closeButton(page)).toBeFocused();

    // Held: one press, then the repeats a held key sends.
    await page.keyboard.down('Enter');
    for (let i = 0; i < 6; i++) await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await expect(printDialog(page)).toBeHidden();
    await expect(saveAndPrint(page)).toBeEnabled();
    await expect(saveAndPrint(page)).not.toBeFocused();

    // …and a moment later, a few more for good measure.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    await settle(page);
    await expect(printDialog(page)).toBeHidden();

    expect(saves, 'POST /prescriptions after Enter was held on Close').toHaveLength(1);
    await expectOneRow(page, mobile);
  });
});

test.describe('the header', () => {
  test('"Mirror devices" is a switch: it turns on and off, and a press does not send the cursor into the patient search', async ({ page }) => {
    await login(page, 'headerSwitch');
    const mirror = page.getByRole('switch', { name: 'Mirror devices' });
    const search = page.getByPlaceholder(/Search by mobile/);
    await expect(mirror).toBeVisible();
    await expect(search).toBeVisible();
    await expect(mirror).toHaveAttribute('aria-checked', 'false');

    await mirror.click();
    await expect(mirror).toHaveAttribute('aria-checked', 'true');
    // It was a <label>, and a caption sends the cursor to the box after it:
    // every press here landed in the search box and reopened its list.
    await expect(search).not.toBeFocused();

    // A switch has a keyboard route; the label it used to be had none.
    await mirror.focus();
    await page.keyboard.press('Space');
    await expect(mirror).toHaveAttribute('aria-checked', 'false');
    await expect(search).not.toBeFocused();
  });
});
