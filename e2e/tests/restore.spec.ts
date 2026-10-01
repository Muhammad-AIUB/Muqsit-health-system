import {
  API_URL, DIAGNOSIS, NAPA, addFieldLine, addMedicine, apiPatientsByMobile, apiPrescriptions,
  createPatient, expect, login, newRxButton, padRow, test, uniqueMobile,
} from './helpers';

test('typed content survives a reload: the auto-saved draft restores patient and editor', async ({ page }) => {
  await login(page, 'restore');
  const name = 'Restore Test Patient';
  const mobile = uniqueMobile();
  await createPatient(page, mobile, name);

  // The debounced auto-save that carries everything typed below. Armed before
  // the edits so it cannot be missed.
  const autoSaved = page.waitForResponse((r) => {
    const body = r.request().postData() ?? '';
    return r.url() === `${API_URL}/prescription-draft`
      && r.request().method() === 'PUT'
      && r.ok()
      && body.includes(NAPA.label) && body.includes(NAPA.duration) && body.includes(DIAGNOSIS);
  }, { timeout: 60_000 });

  await addMedicine(page, 0, NAPA);
  await addFieldLine(page, 'Final diagnosis', DIAGNOSIS);
  await autoSaved;

  await page.reload();

  // The patient is back, locked in as the loaded patient…
  await expect(newRxButton(page)).toBeVisible();
  await expect(page.getByPlaceholder('Patient name')).toHaveValue(name);
  // BRITTLE: the locked mobile box has no label, placeholder or role of its own;
  // it is found as the input beside the "New Prescription" button.
  await expect(newRxButton(page).locator('xpath=preceding-sibling::input')).toHaveValue(mobile);
  // …and so is what was typed.
  const row = padRow(page, 0);
  await expect(row.locator('input').first()).toHaveValue(NAPA.label);
  await expect(row.getByPlaceholder('dose')).toHaveValue(NAPA.dose);
  await expect(row.getByPlaceholder('duration')).toHaveValue(NAPA.duration);
  // .first(): the activity feed lower on the page repeats the line once it has
  // been logged; the clinical column comes first in the document.
  await expect(page.getByText(DIAGNOSIS, { exact: true }).first()).toBeVisible();

  // A draft is not a prescription: nothing was saved as one.
  const [patient] = await apiPatientsByMobile(page, mobile);
  expect(await apiPrescriptions(page, patient.id)).toEqual([]);
});
