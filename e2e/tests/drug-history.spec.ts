import type { Page } from '@playwright/test';
import { API_URL, NAPA, addMedicine, expect, login, mobileLookup, newRxButton, padRow, settle, test, uniqueMobile } from './helpers';

// Drug history's "Move to Rx": the ticked medicines of an earlier visit go onto
// today's pad — and a line that is on the pad already is not written again.
// Real browser, real API, throwaway database; the patient is made up, and the
// doses are there to be recognised on the pad, not to be right.

const badge = (page: Page) => page.getByRole('button', { name: /current.*view/ });
const historyBox = (page: Page) => page.getByRole('dialog', { name: 'Drug history' });

// The record of an earlier visit is written through the API the app itself
// uses, so that the history holds a medicine as a doctor once TYPED it.
async function patientWithHistory(page: Page, name: string, drugHistory: string[]): Promise<string> {
  const mobile = uniqueMobile();
  const made = await page.request.post(`${API_URL}/patients`, { data: { name, mobile } });
  expect(made.status(), await made.text()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  const kept = await page.request.patch(`${API_URL}/patients/${id}`, { data: { drugHistory } });
  expect(kept.status(), await kept.text()).toBe(200);
  return mobile;
}

test('Move to Rx does not write a line a second time because its medicine was typed another way', async ({ page }) => {
  await login(page, 'moveRx');
  const OTHER = 'Tablet. Zzmove 10 mg'; // a made-up name: not in the medicine list, not on the pad
  const mobile = await patientWithHistory(page, 'Move Rx Patient', [
    // Typed by hand at that visit: no capitals, `tab`, no space before the unit.
    `20/07/2026: tab napa 500mg — ${NAPA.dose} —  — ${NAPA.duration}`,
    `20/07/2026: ${OTHER} — 1+0+0 —  — 7 days`,
  ]);

  // Today: the same patient, and the same medicine PICKED from the medicine
  // list, with the same dose and duration.
  await mobileLookup(page).fill(mobile);
  // The patient's own row begins with the name ("＋ Add person related to …" ends with it).
  await page.getByRole('button', { name: /^Move Rx Patient/ }).click();
  await expect(newRxButton(page)).toBeVisible();
  await expect(page.getByPlaceholder('Patient name')).toHaveValue('Move Rx Patient');
  await addMedicine(page, 0, NAPA);
  await expect(padRow(page, 0).getByPlaceholder('food')).toHaveValue('');

  await badge(page).click();
  const box = historyBox(page);
  // That visit is the previous one, so its medicines are under Current
  // medications (physician's sheet, 18/10/2026, item 2), which the box opens on.
  await expect(box.getByRole('button', { name: /^Current medications \(2\)/ })).toBeVisible();
  await box.getByRole('checkbox', { name: 'Select tab napa 500mg' }).check();
  await box.getByRole('checkbox', { name: `Select ${OTHER}` }).check();
  await box.getByRole('button', { name: 'Move to Rx (2)' }).click();
  // One line was there already — and it is said, not swallowed.
  await expect(box).toContainText('1 added · 1 already on ℞');

  await page.keyboard.press('Escape');
  await expect(box).toBeHidden();
  await settle(page);

  // The pad: Napa ONCE, as it was picked; then the other medicine, as the
  // history has it; then the typing line.
  await expect(padRow(page, 0).locator('input').first()).toHaveValue(NAPA.label);
  await expect(padRow(page, 0).getByPlaceholder('dose')).toHaveValue(NAPA.dose);
  await expect(padRow(page, 1).locator('input').first()).toHaveValue(OTHER);
  await expect(padRow(page, 1).getByPlaceholder('dose')).toHaveValue('1+0+0');
  await expect(padRow(page, 1).getByPlaceholder('duration')).toHaveValue('7 days');
  await expect(page.locator('[data-rx-row]')).toHaveCount(3);
});
