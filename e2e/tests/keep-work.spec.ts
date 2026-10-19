import {
  API_URL, DIAGNOSIS, NAPA, addFieldLine, addMedicine, apiPatientsByMobile, apiPrescriptions,
  createPatient, expect, login, newRxButton, printDialog, saveAndOpenSheet, test, uniqueMobile,
} from './helpers';

// ⚕️ Nothing typed is lost on a reload (physician, 19/10/2026). A visit printed
// and then reloaded used to read as unprinted: the next background save parked
// it again and put the patient back to "Incomplete" in the OPD queue, ready to
// be filed a second time. And a change made AFTER printing was kept nowhere but
// the editor's own draft. Real browser, real API, throwaway database; the
// patient is made up.

interface OpdRow { patientId: string | null; rxStatus: string | null }

test('a printed visit stays printed through a reload, and a change after printing is parked', async ({ page }) => {
  await login(page, 'keepWork');
  const mobile = uniqueMobile();
  await createPatient(page, mobile, 'Keep Work Patient');
  await addMedicine(page, 0, NAPA);
  await addFieldLine(page, 'Final diagnosis', DIAGNOSIS);

  // The draft saved after the print carries the printed mark.
  const markSaved = page.waitForResponse((r) =>
    r.url() === `${API_URL}/prescription-draft` && r.request().method() === 'PUT' && r.ok()
    && /"rxCompletedPid":"[^"]+"/.test(r.request().postData() ?? ''), { timeout: 60_000 });
  await saveAndOpenSheet(page);
  await printDialog(page).getByRole('button', { name: 'Close', exact: true }).click();
  await markSaved;

  const [patient] = await apiPatientsByMobile(page, mobile);
  expect(await apiPrescriptions(page, patient.id)).toHaveLength(1);
  const opdRow = async () => {
    const res = await page.request.get(`${API_URL}/opd`);
    expect(res.status()).toBe(200);
    return ((await res.json()) as OpdRow[]).find((v) => v.patientId === patient.id);
  };
  const parked = async () => {
    const res = await page.request.get(`${API_URL}/patients/${patient.id}`);
    return (await res.json()).incompleteRx as Record<string, unknown> | null;
  };
  expect((await opdRow())?.rxStatus).toBe('complete');

  // The reload: the visit is back on the screen, still printed.
  await page.reload();
  await expect(newRxButton(page)).toBeVisible();
  await expect(page.getByText(DIAGNOSIS, { exact: true }).first()).toBeVisible();
  await page.waitForTimeout(3_000); // longer than the auto-save's wait
  expect(await parked()).toBeNull();
  expect((await opdRow())?.rxStatus).toBe('complete');

  // A change after printing is unprinted work: parked, and Incomplete in OPD.
  const parkedNow = page.waitForResponse((r) =>
    r.url() === `${API_URL}/patients/${patient.id}` && r.request().method() === 'PATCH' && r.ok()
    && (r.request().postData() ?? '').includes('Fever after the print'), { timeout: 60_000 });
  await addFieldLine(page, 'Chief complaints', 'Fever after the print');
  await parkedNow;
  expect(JSON.stringify(await parked())).toContain('Fever after the print');
  await expect.poll(async () => (await opdRow())?.rxStatus, { timeout: 15_000 }).toBe('incomplete');

  // Nothing was filed a second time along the way.
  expect(await apiPrescriptions(page, patient.id)).toHaveLength(1);
});
