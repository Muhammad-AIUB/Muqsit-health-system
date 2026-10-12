import {
  API_URL, apiPatientsByMobile, createPatient, expect, login, saveAndOpenSheet, test, uniqueMobile,
} from './helpers';

// ⚕️ A result box that takes its value in either of two units (HBV DNA: IU/mL
// or copies/mL) fills the other in for you, and the preferred unit — the first,
// unless the doctor chose otherwise — is what is recorded and printed.
//
// The conversion read only the START of what was typed. A viral load typed
// with its groups, "1,20,000" copies/mL, was converted from "1": the record
// and the printed prescription said "HBV DNA: 0.18IU/mL" (found in review,
// 2026-10-12; in production until the release that carried this). What cannot
// be converted is now recorded exactly as typed, in the unit of the box it was
// typed in.
//
// The number is made up; the test and its units are the catalog's own.

const POPUP = 'Investigation report findings';
const TYPED = '1,20,000';

test('a viral load typed with its groups in the second unit is recorded and printed as typed — never as a small number of the first', async ({ page }) => {
  await login(page, 'invUnits');
  const mobile = uniqueMobile();
  await createPatient(page, mobile, 'Units Test Patient');

  await page.getByText(POPUP, { exact: true }).first().click();
  const popup = page.getByRole('dialog', { name: POPUP });
  await expect(popup).toBeVisible();
  await popup.getByRole('button', { name: 'LFT / Liver', exact: true }).click();

  const copies = popup.getByLabel('Value (C/mL) — HBV DNA', { exact: true });
  const units = popup.getByLabel('Value (IU/mL) — HBV DNA', { exact: true });
  await copies.fill(TYPED);
  // Not converted from its first group: the other box says nothing.
  await expect(units).toHaveValue('');
  await popup.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(popup).toHaveCount(0);

  // On the screen, as typed…
  await expect(page.getByText(`${TYPED}C/mL`).first()).toBeVisible();

  // …on the printed sheet…
  const sheet = await saveAndOpenSheet(page);
  await expect(sheet.locator('.sheet').first()).toContainText(`${TYPED}C/mL`);
  await expect(sheet.locator('.sheet').first()).not.toContainText('IU/mL');

  // …and in the record.
  const [patient] = await apiPatientsByMobile(page, mobile);
  const res = await page.request.get(`${API_URL}/prescriptions?patientId=${patient.id}`);
  expect(res.status(), 'GET /prescriptions').toBe(200);
  const [rx] = (await res.json()) as { investigation: string[] }[];
  const findings = rx.investigation.filter((line) => line.includes(':HBV DNA:'));
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatch(new RegExp(`^\\d{2}/\\d{2}/\\d{4}:HBV DNA:${TYPED}C/mL$`));
});

test('a plain number in the second unit is still converted, and recorded in the first', async ({ page }) => {
  await login(page, 'invUnitsPlain');
  await createPatient(page, uniqueMobile(), 'Units Test Patient Two');

  await page.getByText(POPUP, { exact: true }).first().click();
  const popup = page.getByRole('dialog', { name: POPUP });
  await popup.getByRole('button', { name: 'LFT / Liver', exact: true }).click();
  await popup.getByLabel('Value (C/mL) — HBV DNA', { exact: true }).fill('120000');
  // Whatever the catalog's factor makes of it, the first unit's box now holds a plain number.
  await expect(popup.getByLabel('Value (IU/mL) — HBV DNA', { exact: true })).toHaveValue(/^\d+(\.\d+)?$/);
  const converted = await popup.getByLabel('Value (IU/mL) — HBV DNA', { exact: true }).inputValue();
  await popup.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText(`${converted}IU/mL`).first()).toBeVisible();
});
