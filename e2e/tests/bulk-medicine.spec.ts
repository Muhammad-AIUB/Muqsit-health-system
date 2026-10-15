import type { Page } from '@playwright/test';
import {
  API_URL, DIAGNOSIS, NAPA, addFieldLine, addMedicine, createPatient, expect, login, mobileLookup, newRxButton,
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

// ── The other journeys start from a doctor who HAS a history ──────────────────
// A habit is learned from a saved prescription, so the history is written
// through the API the app itself uses — for made-up patients, with made-up
// doses that are there to be recognised on the pad, not to be right.
interface Line { drug: string; dose: string; instruction: string; duration: string; isCont?: boolean }
const med = (drug: string, dose: string, instruction: string, duration: string): Line => ({ drug, dose, instruction, duration });
const then = (dose: string, instruction: string, duration: string): Line => ({ drug: '', dose, instruction, duration, isCont: true });

async function teach(page: Page, blocks: Line[][]) {
  const made = await page.request.post(`${API_URL}/patients`, { data: { name: 'Bulk History Patient', mobile: uniqueMobile() } });
  expect(made.status(), await made.text()).toBe(201);
  const patientId = ((await made.json()) as { id: string }).id;
  const saved = await page.request.post(`${API_URL}/prescriptions`, { data: { patientId, items: blocks.flat() } });
  expect(saved.status(), await saved.text()).toBe(201);
}

const BARCAVIR = 'Tablet. Barcavir 0.5 mg'; // in the test catalogue, with its generic
const DELTASONE = 'Tablet. Deltasone 5 mg';
const tickOf = (page: Page, name: string) => bulkBox(page).getByRole('checkbox', { name: new RegExp(name) });
// A prescribing warning on the page: an alert INSIDE the app (`<main>`). Next's
// own route announcer carries the alert role too, and stands outside it. It was
// told apart by its text at first — the page's title — which it holds on the
// dev server and not in a production build: there it is empty, passed for a
// warning, and failed this journey the first time it was run on one.
const warnings = (page: Page) => page.getByRole('main').getByRole('alert');
const search = (page: Page) => bulkBox(page).getByRole('textbox', { name: 'Search medicines' });

test('from the keyboard alone: search, move, tick and Add — a taper goes with its medicine, its warning fires, and Enter held on Add does not open the box again', async ({ page }) => {
  await login(page, 'bulkKeys');
  await teach(page, [
    [med(BARCAVIR, '1+0+0', '', 'Continue')],
    [med(DELTASONE, '2+0+0', 'After meal', '5 days'), then('1+0+0', 'After meal', '5 days'), then('0.5+0+0', 'After meal', '5 days')],
    [med(NAPA.label, '1+1+1', 'After meal', '5 days')],
  ]);
  await createPatient(page, uniqueMobile(), 'Bulk Keys Patient');

  // A condition the app's own rules warn about for Barcavir's generic — picked
  // from the app's quick-picks, as in prescription.spec.ts; nothing clinical is
  // typed here and the warning's words are not written here.
  await page.getByText('Associated illness', { exact: true }).click();
  await page.getByLabel('CKD', { exact: true }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(warnings(page)).toHaveCount(0);

  await plus(page).focus();
  await page.keyboard.press('Enter');
  await expect(bulkBox(page)).toBeVisible();
  await expect(tickOf(page, 'Barcavir')).toBeVisible();

  // With a keyboard at hand the search can be typed at once — here by generic.
  await expect(search(page)).toBeFocused();
  await page.keyboard.type('entecavir');
  await expect(bulkBox(page).getByRole('checkbox')).toHaveCount(1);
  await expect(bulkBox(page)).toContainText('Entecavir');

  // The list is ONE Tab stop; Space ticks.
  await page.keyboard.press('Tab');
  await expect(tickOf(page, 'Barcavir')).toBeFocused();
  await page.keyboard.press('Space');
  await expect(tickOf(page, 'Barcavir')).toBeChecked();

  // Back to the search: Escape clears it and leaves the box — and the tick.
  await page.keyboard.press('Shift+Tab');
  await expect(search(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(bulkBox(page)).toBeVisible();
  await expect(search(page)).toHaveValue('');
  await expect(bulkBox(page).getByRole('checkbox')).toHaveCount(3);
  await expect(tickOf(page, 'Barcavir')).toBeChecked();

  // The arrows move along the rows and tick nothing.
  await page.keyboard.press('Tab');
  await expect(tickOf(page, 'Barcavir')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(tickOf(page, 'Deltasone')).toBeFocused();
  await expect(tickOf(page, 'Deltasone')).not.toBeChecked();
  await page.keyboard.press('Space');
  await expect(tickOf(page, 'Deltasone')).toBeChecked();

  // One Tab leaves the list: Cancel, then Add.
  await page.keyboard.press('Tab');
  await expect(bulkBox(page).getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(bulkBox(page).getByRole('button', { name: 'Add (2)' })).toBeFocused();

  // Enter, HELD. The first press adds and hands the focus back to the +; the
  // repeats that follow land on the + and must not press it.
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(bulkBox(page)).toBeHidden();
  await expect(plus(page)).toBeFocused();
  await settle(page);
  await expect(page.getByRole('status', { name: 'Add Bulk Medicine result' })).toHaveText('2 added');

  // On the pad: each medicine with what was written, the taper under its own.
  const written = async (i: number) => [
    await padRow(page, i).getByPlaceholder('dose').inputValue(),
    await padRow(page, i).getByPlaceholder('food').inputValue(),
    await padRow(page, i).getByPlaceholder('duration').inputValue(),
  ];
  await expect(padRow(page, 0).locator('input').first()).toHaveValue(BARCAVIR);
  expect(await written(0)).toEqual(['1+0+0', '', 'Continue']); // the blank cell is blank
  await expect(padRow(page, 1).locator('input').first()).toHaveValue(DELTASONE);
  expect(await written(1)).toEqual(['2+0+0', 'After meal', '5 days']);
  // A tapering line has no medicine box of its own: it stands under Deltasone.
  expect(await written(2)).toEqual(['1+0+0', 'After meal', '5 days']);
  expect(await written(3)).toEqual(['0.5+0+0', 'After meal', '5 days']);
  await expect(page.locator('[data-rx-row]')).toHaveCount(5); // the four lines and the typing line

  // And the medicine came with its generic: the warning is on the screen.
  await expect(warnings(page).first()).toBeVisible();
});

test('with the connection gone the box says the list could not be loaded — and loads it when the connection is back', async ({ page, context }) => {
  await login(page, 'bulkOffline');
  await teach(page, [[med(NAPA.label, NAPA.dose, '', NAPA.duration)]]);
  await createPatient(page, uniqueMobile(), 'Bulk Offline Patient');

  await context.setOffline(true);
  await plus(page).click();
  // It asks all the same, fails, tries once more, and says so — it does not sit
  // as "No medicines yet" in front of a doctor who has a history.
  await expect(bulkBox(page).getByRole('alert')).toContainText('The medicine list could not be loaded.', { timeout: 30_000 });
  await expect(bulkBox(page)).toContainText('Check your internet connection and try again.');
  await expect(bulkBox(page)).not.toContainText('No medicines yet');
  await expect(bulkBox(page).getByRole('checkbox')).toHaveCount(0);

  await context.setOffline(false);
  await bulkBox(page).getByRole('button', { name: 'Try again' }).click();
  await expect(napaRow(page)).toBeVisible({ timeout: 30_000 });
  await napaRow(page).check();
  await bulkBox(page).getByRole('button', { name: 'Add (1)' }).click();
  await expect(padRow(page, 0).locator('input').first()).toHaveValue(NAPA.label);
});

test('on a phone the + is there, the box is whole on the screen, and it adds', async ({ page }) => {
  await login(page, 'bulkPhone');
  await teach(page, [
    [med(NAPA.label, NAPA.dose, 'After meal', NAPA.duration)],
    [med('Tablet. Amlodipine + Olmesartan Medoxomil + Hydrochlorothiazide 10 mg+40 mg+25 mg', '1+0+0', 'After breakfast', 'Continue')],
    [med(DELTASONE, '2+0+0', 'After meal', '5 days'), then('1+0+0', 'After meal', '5 days')],
  ]);
  await createPatient(page, uniqueMobile(), 'Bulk Phone Patient');

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(plus(page)).toBeVisible({ timeout: 30_000 });
  await plus(page).scrollIntoViewIfNeeded();
  await plus(page).click();
  await expect(napaRow(page)).toBeVisible();

  const fit = await page.evaluate(() => {
    const box = document.querySelector('[role="dialog"][aria-label="Add Bulk Medicine"]') as HTMLElement;
    const r = box.getBoundingClientRect();
    const strength = Array.from(box.querySelectorAll<HTMLElement>('[data-strength]')).find((s) => s.textContent === '10 mg+40 mg+25 mg') as HTMLElement;
    return {
      inside: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      // One line box: the strength was not turned in its middle.
      strengthLines: strength.getClientRects().length,
    };
  });
  expect(fit).toEqual({ inside: true, sideways: false, strengthLines: 1 });

  await napaRow(page).check();
  await bulkBox(page).getByRole('button', { name: 'Add (1)' }).click();
  await expect(bulkBox(page)).toBeHidden();
  await expect(page.getByRole('status', { name: 'Add Bulk Medicine result' })).toHaveText('1 added');
});

test('medicines added below the edge of a long pad are brought into view — and a long list in the box costs the keyboard nothing', async ({ page }) => {
  await login(page, 'bulkMany');
  const names = Array.from({ length: 14 }, (_, i) => `Tablet. Longlist${String(i + 1).padStart(2, '0')} 10 mg`);
  // Forty more for the box alone, so that the end of its list is far out of
  // sight — and all but the first four with two tapering lines, so that a row
  // drawn is a good deal TALLER than the space kept for it before it is.
  const more = Array.from({ length: 40 }, (_, i) => `Tablet. Zzlist${String(i + 1).padStart(2, '0')} 10 mg`);
  await teach(page, names.map((n) => [med(n, '1+0+1', 'After meal', '7 days')]));
  await teach(page, more.map((n, i) => (i < 4
    ? [med(n, '1+0+1', 'After meal', '7 days')]
    : [med(n, '1+0+1', 'After meal', '7 days'), then('1+0+0', 'After meal', '7 days'), then('0+0+1', 'After meal', '7 days')])));
  await createPatient(page, uniqueMobile(), 'Bulk Long Pad Patient');

  // Eleven lines: one more than the pad shows before it scrolls.
  await plus(page).click();
  for (const n of names.slice(0, 11)) await tickOf(page, n).check();
  await bulkBox(page).getByRole('button', { name: 'Add (11)' }).click();
  await expect(bulkBox(page)).toBeHidden();
  await settle(page);
  await expect(padRow(page, 10).locator('input').first()).toHaveValue(names[10]);

  // Look at the top of the pad again, as a doctor reading it over would.
  await padRow(page, 0).scrollIntoViewIfNeeded();
  await expect(padRow(page, 0)).toBeInViewport();

  // Three more go on after the last line — below the pad's edge.
  await plus(page).click();
  await expect(tickOf(page, names[0])).toBeVisible();

  // A row out of sight is not laid out or painted until it is scrolled to: that
  // is what keeps a list of two thousand quick to open and to re-order. It must
  // cost the keyboard nothing. The box now lists fifty-four medicines.
  const last = more[39];
  const drawn = (name: string) => tickOf(page, name).evaluate((c) =>
    (c as Element & { checkVisibility(o: { contentVisibilityAuto: boolean }): boolean }).checkVisibility({ contentVisibilityAuto: true }));
  expect(await drawn(names[0])).toBe(true);
  expect(await drawn(last)).toBe(false);
  // A row used to be given a stand-in height until it was drawn (67px — a
  // number written without the padding in mind once made it 85). The chips of
  // 15/10/2026 are not drawn either, but Chromium lays them out at their own
  // height all the same (measured: a never-drawn chip with two tapering lines
  // stands 101px, as it does drawn). What that must keep is the point of the
  // stand-in: nothing moves when a chip is drawn. Its height undrawn is held
  // here and compared once End has drawn it.
  const chipHeight = (name: string) => tickOf(page, name).evaluate((c) => (c.closest('[data-chip]') as HTMLElement).getBoundingClientRect().height);
  const undrawnHeight = await chipHeight(last);
  expect(undrawnHeight).toBeGreaterThan(60);

  // ⚕️ The row a key lands on is on the screen: one that has the focus and is
  // out of sight is ticked unseen. The rows a key brings near are drawn a
  // frame later, taller than the space that was kept for them, and push what
  // is below them down. Chromium holds the page still through that (scroll
  // anchoring); a browser without it does not (Safari is documented as having
  // none; it is not run here) — so it is switched off here, and the row is
  // looked for only once the frames have settled.
  const noAnchoring = await page.addStyleTag({ content: '[role="dialog"][aria-label="Add Bulk Medicine"] * { overflow-anchor: none !important; }' });
  const onScreen = (name: string) => tickOf(page, name).evaluate(async (c) => {
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r));
    const row = (c.closest('label') as HTMLElement).getBoundingClientRect();
    const list = (c.closest('[role="group"]') as HTMLElement).getBoundingClientRect();
    return row.top >= list.top - 1 && row.bottom <= list.bottom + 1;
  });

  // End reaches the last row, which was never drawn; Space ticks it.
  await page.keyboard.press('Tab'); // search → the list
  await expect(tickOf(page, names[0])).toBeFocused();
  await page.keyboard.press('End');
  await expect(tickOf(page, last)).toBeFocused();
  expect(await onScreen(last)).toBe(true);
  expect(await drawn(last)).toBe(true);
  expect(Math.abs((await chipHeight(last)) - undrawnHeight)).toBeLessThanOrEqual(1);
  await page.keyboard.press('Space');
  await expect(tickOf(page, last)).toBeChecked();
  await expect(bulkBox(page)).toContainText('1 selected');
  // The Page keys move ten rows at a time — down the list and back up it.
  await page.keyboard.press('Home');
  await expect(tickOf(page, names[0])).toBeFocused();
  expect(await onScreen(names[0])).toBe(true);
  for (const landed of [names[10], more[6], more[16], more[26]]) {
    await page.keyboard.press('PageDown');
    await expect(tickOf(page, landed)).toBeFocused();
    expect(await onScreen(landed), `${landed} after Page Down`).toBe(true);
  }
  for (const landed of [more[16], more[6]]) {
    await page.keyboard.press('PageUp');
    await expect(tickOf(page, landed)).toBeFocused();
    expect(await onScreen(landed), `${landed} after Page Up`).toBe(true);
  }
  await noAnchoring.evaluate((el) => el.remove());
  await tickOf(page, last).uncheck();
  await expect(bulkBox(page)).toContainText('Tick the medicines to add.');

  for (const n of names.slice(11)) await tickOf(page, n).check();
  await bulkBox(page).getByRole('button', { name: 'Add (3)' }).click();
  await expect(bulkBox(page)).toBeHidden();
  await settle(page);
  for (const i of [11, 12, 13]) {
    await expect(padRow(page, i).locator('input').first()).toHaveValue(names[i]);
    await expect(padRow(page, i)).toBeInViewport();
  }
});
