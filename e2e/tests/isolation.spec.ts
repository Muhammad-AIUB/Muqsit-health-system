import {
  API_URL, DIAGNOSIS, NAPA, addFieldLine, addMedicine, apiPatientsByMobile, apiPrescriptions,
  assertGuard, createPatient, expect, guardContext, login, mobileLookup, saveAndOpenSheet, test,
  uniqueMobile,
} from './helpers';

test("another doctor looking up the same mobile is never shown the first doctor's patient", async ({ page, browser }) => {
  // Doctor A: a patient with a saved prescription.
  await login(page, 'isoA');
  const name = 'Isolation Patient Of A';
  const mobile = uniqueMobile();
  await createPatient(page, mobile, name);
  await addMedicine(page, 0, NAPA);
  await addFieldLine(page, 'Final diagnosis', DIAGNOSIS);
  await saveAndOpenSheet(page);
  const [patientOfA] = await apiPatientsByMobile(page, mobile);
  expect(await apiPrescriptions(page, patientOfA.id)).toHaveLength(1);

  // Doctor B: a separate browser (own cookies, own storage).
  const contextB = await browser.newContext();
  const guardB = await guardContext(contextB);
  try {
    const pageB = await contextB.newPage();
    await login(pageB, 'isoB');

    await mobileLookup(pageB).fill(mobile);

    // Offered as a NEW patient; A's record is not listed, not even as a relative.
    await expect(pageB.getByRole('button', { name: /No patient on this number/ })).toBeVisible();
    await expect(pageB.getByText(name)).toHaveCount(0);
    await expect(pageB.getByRole('button', { name: /Add person related to/ })).toHaveCount(0);

    // The same through the API with B's session: nothing of A's is readable.
    expect(await apiPatientsByMobile(pageB, mobile)).toEqual([]);
    const relatives = await pageB.request.get(`${API_URL}/patients/relatives-by-mobile?mobile=${mobile}`);
    expect(relatives.status()).toBe(200);
    expect(await relatives.json()).toEqual([]);

    const direct = await pageB.request.get(`${API_URL}/patients/${patientOfA.id}`);
    expect([403, 404]).toContain(direct.status());
    expect(await direct.text()).not.toContain(name);

    const rx = await pageB.request.get(`${API_URL}/prescriptions?patientId=${patientOfA.id}`);
    const rxBody = await rx.text();
    expect(rxBody).not.toContain(DIAGNOSIS);
    expect(rxBody).not.toContain(NAPA.label);
    if (rx.status() === 200) expect(JSON.parse(rxBody)).toEqual([]);
    else expect([403, 404]).toContain(rx.status());

    const list = await pageB.request.get(`${API_URL}/patients`);
    expect(list.status()).toBe(200);
    expect(await list.text()).not.toContain(name);
  } finally {
    await contextB.close();
  }
  assertGuard(guardB);
});
