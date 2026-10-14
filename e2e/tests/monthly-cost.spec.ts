import { NAPA, addMedicine, createPatient, expect, login, test, uniqueMobile } from './helpers';

// ⚕️ "Total monthly approximate cost", priced from the medicine chart through
// the real route (`POST /api/medicines/by-brand`) and a real browser. The
// physician's own warning is what it holds first: two strengths of one
// medicine are two prices (Sergel 20 mg is not Sergel 40 mg — here a made-up
// Zzcostcap, seeded in `server/test/seed-e2e.ts`). And a medicine the chart
// does not price (the test catalogue's Napa has no price) is not in the total
// and is said to be not in it.

const CAP20 = { search: 'Zzcostcap', label: 'Capsule (Enteric Coated). Zzcostcap 20 mg', dose: '1+0+1', duration: 'Continue' };
const CAP40 = { search: 'Zzcostcap', label: 'Capsule (Enteric Coated). Zzcostcap 40 mg', dose: '1+0+0', duration: '7 days' };

test('each strength at its own price, and a medicine the chart does not price is named, not added', async ({ page }) => {
  await login(page, 'monthlyCost');
  const box = page.getByTestId('monthly-cost');
  await expect(box).toHaveText('৳0.0');
  await createPatient(page, uniqueMobile(), 'Cost Test Patient');

  await addMedicine(page, 0, CAP20);
  await expect(box).toHaveText('৳300.0'); // 2 a day × 30 days × ৳5

  await addMedicine(page, 1, CAP40);
  await expect(box).toHaveText('৳8,350.0'); // + 1 a day × 7 days × ৳1,150

  await addMedicine(page, 2, NAPA);
  await expect(box).toHaveText('৳8,350.0· 1 not priced');
  await box.getByRole('button', { name: /1 not priced/ }).click();
  const told = page.getByRole('alertdialog', { name: '1 medicine is not in the total' });
  await expect(told).toContainText(`${NAPA.label} — the medicine chart gives no price for it`);
  await expect(told).toContainText('৳8,350.0 is the cost of the other 2.');
  await told.getByRole('button', { name: 'OK' }).click();
  await expect(told).toBeHidden();
});
