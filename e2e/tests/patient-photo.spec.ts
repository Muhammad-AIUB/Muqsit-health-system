import { API_URL, WEB_URL, expect, login, mobileLookup, newRxButton, test, uniqueMobile } from './helpers';

// ⚕️ The header photo belongs to the patient on screen (physician, 02/11/2026:
// "Prscrptn chng krle image dekhay jay previous image er"). "New Prescription"
// used to leave the last patient's face over an empty header. Real browser,
// real API, throwaway database; the "photo" is the app's own logo, served by
// the test client (the request guard allows no other host).

test('New Prescription takes the last patient\'s photo off the header', async ({ page }) => {
  await login(page, 'patientPhoto');
  const mobile = uniqueMobile();
  const made = await page.request.post(`${API_URL}/patients`, { data: { name: 'Photo Patient', mobile } });
  expect(made.status(), await made.text()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  const picture = `${WEB_URL}/exort-logo.png`;
  const kept = await page.request.patch(`${API_URL}/patients/${id}`, { data: { pictureUrl: picture } });
  expect(kept.status(), await kept.text()).toBe(200);

  await mobileLookup(page).fill(mobile);
  await page.getByRole('button', { name: /^Photo Patient/ }).click();
  await expect(page.getByPlaceholder('Patient name')).toHaveValue('Photo Patient');
  const photo = page.getByRole('button', { name: /^Patient photo/ });
  await expect(photo.locator('img')).toHaveAttribute('src', picture);

  await newRxButton(page).click();
  await expect(page.getByPlaceholder('Patient name')).toHaveValue('');
  // The placeholder drawing, not the last patient's picture.
  await expect(photo.locator('img')).toHaveCount(0);
  await expect(photo.locator('svg[data-icon]')).toHaveCount(1);
});
