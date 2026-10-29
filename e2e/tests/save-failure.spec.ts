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
//
// A request that never left and one whose ANSWER was lost after the server
// stored it look the same to the client. It sends the very same request again,
// quietly, a few times (client/src/lib/sendAgain.ts) — the server answers the
// same prescription with the one on record (server/src/prescriptions/repeat.ts)
// — and when no answer comes, the box says it MAY not have been saved.

/** What a CSS colour variable of the app's palette resolves to on this page. */
const resolved = (page: Page, cssVar: string) => page.evaluate((v) => {
  const probe = document.createElement('span');
  probe.style.color = `var(${v})`;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}, cssVar);

test('a Save & print that never reaches the server is sent again, then said in a box, and keeps the prescription to save again', async ({ page }) => {
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
  let posts = 0;
  await page.route(`${API_URL}/prescriptions`, (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts += 1;
    return route.abort('internetdisconnected');
  });

  await saveAndPrint(page).click();
  // Sent four times in all (three re-sends, seven seconds), then the box.
  const box = page.getByRole('alertdialog', { name: 'The prescription may not have been saved.' });
  await expect(box).toBeVisible();
  expect(posts).toBe(4);
  await expect(box).toContainText('Check your internet connection and try again.');
  await expect(box).toContainText('if you press Save & print again within half an hour without changing anything, it will not be filed twice.');
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

// ⚕️ The server STORED the prescription and the answer was lost on its way
// back. Until this, the doctor was told "The prescription was not saved.", the
// visit stayed "Incomplete", and a word changed before pressing again filed it
// twice. The client sends the very same request again; the server answers it
// with the one on record.
test('a Save & print whose answer is lost after the server stored it is sent again, printed, and on the record once', async ({ page }) => {
  await login(page, 'answerLost');
  const mobile = uniqueMobile();
  await createPatient(page, mobile, 'Answer Lost Patient');
  await addMedicine(page, 0, NAPA);

  let posts = 0;
  await page.route(`${API_URL}/prescriptions`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts += 1;
    if (posts > 1) return route.continue();
    await route.fetch(); // the server stores it…
    return route.abort('connectionreset'); // …and its answer never arrives
  });

  await saveAndPrint(page).click();
  await waitForSheet(page);
  expect(posts).toBe(2);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  const [patient] = await apiPatientsByMobile(page, mobile);
  const rx = await apiPrescriptions(page, patient.id);
  expect(rx).toHaveLength(1);
  expect(rx[0].items.map((i) => i.drug)).toEqual([NAPA.label]);
});

test('an answer lost on every try says the prescription MAY not have been saved — pressed again, unchanged, it is on the record once', async ({ page }) => {
  await login(page, 'answerLostAll');
  const mobile = uniqueMobile();
  await createPatient(page, mobile, 'Answer Lost Every Time');
  await addMedicine(page, 0, NAPA);

  let posts = 0;
  await page.route(`${API_URL}/prescriptions`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    posts += 1;
    await route.fetch(); // stored the first time, the one on record after that…
    return route.abort('connectionreset'); // …and no answer arrives
  });

  await saveAndPrint(page).click();
  const box = page.getByRole('alertdialog', { name: 'The prescription may not have been saved.' });
  await expect(box).toContainText('It may have reached the record all the same: if you press Save & print again within half an hour without changing anything, it will not be filed twice.');
  await expect(box).toContainText('Everything you wrote is still here.');
  await expect(box).not.toContainText('API');
  expect(posts).toBe(4);
  // No printable sheet for a visit the client cannot say is on the record.
  await expect(printDialog(page)).toBeHidden();
  const [patient] = await apiPatientsByMobile(page, mobile);
  expect(await apiPrescriptions(page, patient.id)).toHaveLength(1); // four sent, one stored
  await box.getByRole('button', { name: 'OK' }).click();
  await expect(padRow(page, 0).locator('input').first()).toHaveValue(NAPA.label);

  // The connection is back, and the doctor presses again with nothing changed.
  await page.unroute(`${API_URL}/prescriptions`);
  await saveAndPrint(page).click();
  await waitForSheet(page);
  expect(await apiPrescriptions(page, patient.id)).toHaveLength(1);
});
