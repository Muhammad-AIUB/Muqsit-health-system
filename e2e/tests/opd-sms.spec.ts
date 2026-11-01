import type { Page } from '@playwright/test';
import { API_URL, expect, login, test } from './helpers';

// "Send SMS to all patients" and Settings → Payment (physician's sheet,
// 28/10/2026), in a real browser against the test API. The test API has no SMS
// keys: its gateway is NOT configured, which is the path held here — the box
// must say so, and nothing can be sent or charged. Every name and number is
// made up. Uses its own seeded doctor, `opdSms`.

const TODAY = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
const SHOTS = process.env.E2E_SHOTS;

async function seed(page: Page) {
  const profile = await page.request.patch(`${API_URL}/users/me`, {
    data: { displayName: 'Dr. Smstest', chambers: [{ address: 'Test Clinic, Road 1', mapLink: '' }] },
  });
  expect(profile.status(), 'PATCH /users/me').toBeLessThan(300);
  const have = await page.request.get(`${API_URL}/opd?date=${TODAY}`);
  if (((await have.json()) as unknown[]).length > 0) return;
  const sched = await page.request.put(`${API_URL}/opd/schedule`, {
    data: { date: TODAY, startTime: '18:00', breakStart: null, breakEnd: null, minutesPerPatient: 10 },
  });
  expect(sched.status()).toBeLessThan(300);
  for (const v of [
    { name: 'Smsq Alpha', phone: '01711222333' },
    { name: 'Smsq Beta' },
    { name: 'Smsq Gamma', phone: '01811222333' },
  ]) {
    const res = await page.request.post(`${API_URL}/opd`, { data: { ...v, date: TODAY } });
    expect(res.status()).toBeLessThan(300);
  }
}

test('SMS to the day: Bangla or English, every message and its cost, no send without a gateway, Buy SMS → Payment', async ({ page }) => {
  await login(page, 'opdSms');
  await seed(page);
  await page.goto('/opd');
  const smsButton = page.getByRole('button', { name: 'Send SMS to all patients' });
  await expect(smsButton).toBeEnabled();
  await smsButton.click();

  const box = page.getByRole('dialog', { name: 'Send SMS to all patients' });
  await expect(box.getByText('Send the SMS in Bangla or in English?')).toBeVisible();
  await box.getByRole('button', { name: 'English' }).click();

  const rows = box.getByRole('list', { name: 'Patients' }).locator('[data-sms-row]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText(
    'Smsq Alpha, your appointment time to dr. Smstest at Test Clinic, Road 1 at 6.00PM. Be present 30min prior to your appointment time.',
  );
  await expect(rows.nth(1)).toContainText('No mobile number.');
  await expect(rows.nth(2)).toContainText('6.20PM');
  await expect(box.locator('[data-sms-total]')).toHaveText('2 patients · 2 SMS × 1 taka = 2 taka');
  await expect(box.locator('[data-sms-balance]')).toHaveText('SMS balance: 0 taka');
  await expect(box.getByText('SMS gateway is not configured. No SMS can be sent and nothing will be charged.')).toBeVisible();
  await expect(box.getByText('Not enough SMS balance.')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/sms-english.png` });

  // Bangla counts as more SMS: with this address each message is over 134 UCS-2
  // characters, 3 SMS.
  await box.getByRole('button', { name: 'Change language' }).click();
  await box.getByRole('button', { name: /Bangla/ }).click();
  await expect(rows.nth(0)).toContainText('সন্ধ্যা ৬:০০');
  await expect(box.locator('[data-sms-total]')).toHaveText('2 patients · 6 SMS × 1 taka = 6 taka');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/sms-bangla.png` });

  // Nothing was charged and nothing is on the ledger.
  expect((await (await page.request.get(`${API_URL}/sms/ledger`)).json()) as unknown[]).toEqual([]);

  await box.getByRole('button', { name: 'Buy SMS' }).click();
  await expect(page).toHaveURL(/\/settings\/payment$/);
  await expect(page.getByText('SMS balance', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Buy SMS' }).click();
  await page.getByLabel('Number of SMS').fill('100');
  await page.getByRole('button', { name: 'Send Buy SMS request' }).click();
  await expect(page.getByText(/Request sent to the admin/)).toBeVisible();
  await expect(page.locator('[data-payment-request="pending"]').first()).toContainText('Buy SMS · 100 SMS');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/payment.png`, fullPage: true });
});
