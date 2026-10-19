import type { Page } from '@playwright/test';
import { API_URL, NAPA, addMedicine, apiPatientsByMobile, apiPrescriptions, createPatient, expect, login, padRow, printDialog, saveAndPrint, test, uniqueMobile, waitForSheet } from './helpers';

// ⚕️ What the Save buttons say when a save does not happen. Until 18/10/2026
// every message under them was drawn in the "saved" green — "Save failed: …"
// and "Draft NOT saved …" among them — two ended "Is the API running?", and the
// line went after three to five seconds; after Save & print it was under the
// print sheet. Now a save that did not happen is a box the doctor has to read,
// in their words, and the line says only what can be put right on the screen
// (amber) or what was saved (green). Real browser, real API, throwaway
// database; the request is dropped or failed by the test, the patient is made up.

/** What a CSS colour variable of the app's palette resolves to on this page. */
const resolved = (page: Page, cssVar: string) => page.evaluate((v) => {
  const probe = document.createElement('span');
  probe.style.color = `var(${v})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}, cssVar);

test('a Save & print that never reaches the server says so in a box, and keeps the prescription to save again', async ({ page }) => {
  await login(page, 'saveFailed');
  const mobile = uniqueMobile();
  await createPatient(page, mobile, 'Save Failure Patient');

  // An empty form is refused on the line under the buttons — amber, not the
  // green of a saved prescription. (The colours are read first: the line is
  // there for three seconds.)
  const amber = await resolved(page, '--c-warn-800');
  expect(amber).not.toBe(await resolved(page, '--c-ok-600'));
  await saveAndPrint(page).click();
  const emptyLine = page.getByRole('status').filter({ hasText: 'Add a medicine or some clinical detail before saving.' });
  await expect(emptyLine).toHaveCSS('color', amber);

  await addMedicine(page, 0, NAPA);
  await page.route(`${API_URL}/prescriptions`, (route) =>
    route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue());

  await saveAndPrint(page).click();
  const box = page.getByRole('alertdialog', { name: 'The prescription was not saved.' });
  await expect(box).toContainText('Check your internet connection and try again.');
  await expect(box).toContainText('Everything you wrote is still here.');
  await expect(box).not.toContainText('API');
  // No printable sheet for a visit the record does not have.
  await expect(printDialog(page)).toBeHidden();
  await box.getByRole('button', { name: 'OK' }).click();
  await expect(box).toBeHidden();
  await expect(page.getByText(/Save failed|Is the API running|Prescription saved/)).toHaveCount(0);
  await expect(padRow(page, 0).locator('input').first()).toHaveValue(NAPA.label);

  const [patient] = await apiPatientsByMobile(page, mobile);
  expect(await apiPrescriptions(page, patient.id)).toEqual([]);

  // The connection is back: the same prescription saves, once.
  await page.unroute(`${API_URL}/prescriptions`);
  await saveAndPrint(page).click();
  await waitForSheet(page);
  expect(await apiPrescriptions(page, patient.id)).toHaveLength(1);
});

test('"Save to complete later" that the server fails says so in a box, in the doctor\'s words, and clears nothing', async ({ page }) => {
  await login(page, 'draftFailed');
  await createPatient(page, uniqueMobile(), 'Draft Failure Patient');
  await addMedicine(page, 0, NAPA);

  await page.route(`${API_URL}/prescription-draft`, (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"statusCode":500,"message":"Internal server error"}' })
      : route.continue());

  await page.getByRole('button', { name: 'Save to complete later' }).click();
  const box = page.getByRole('alertdialog', { name: 'The visit was not saved for later.' });
  await expect(box).toContainText('The server could not save it just now. Please try again in a moment.');
  await expect(box).toContainText('Everything you wrote is still here.');
  await expect(box).not.toContainText('Internal server error');
  await expect(box).not.toContainText('API');
  await box.getByRole('button', { name: 'OK' }).click();
  await expect(box).toBeHidden();
  await expect(page.getByPlaceholder('Patient name')).toHaveValue('Draft Failure Patient');
  await expect(padRow(page, 0).locator('input').first()).toHaveValue(NAPA.label);

  // The server answers again: the visit is parked, and that is said in green.
  const green = await resolved(page, '--c-ok-600');
  await page.unroute(`${API_URL}/prescription-draft`);
  await page.getByRole('button', { name: 'Save to complete later' }).click();
  const saved = page.getByRole('status').filter({ hasText: 'Draft saved — you can complete it later.' });
  await expect(saved).toHaveCSS('color', green);
});
