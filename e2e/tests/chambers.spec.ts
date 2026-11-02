import type { Page } from '@playwright/test';
import { expect, login, test, uniqueMobile } from './helpers';

// Multiple chambers (physician's sheet 28/10/2026, item 8): a chamber is added in
// Settings, "My Chamber" beside Prescription chooses it, and each chamber keeps
// its own OPD list. Real browser, real API, throwaway database; names made up.

const rows = (page: Page) => page.locator('.queue-row');
const myChamber = (page: Page) => page.getByLabel('My Chamber').first();

async function addNewToQueue(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add to queue' }).click();
  await page.getByPlaceholder('01XXXXXXXXX').fill(uniqueMobile());
  await page.getByRole('button', { name: /No patient on this number/ }).click();
  await page.getByPlaceholder('Full name').fill(name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(rows(page).filter({ hasText: name })).toBeVisible();
}

test('a chamber added in Settings has its own OPD list, chosen under My Chamber', async ({ page }) => {
  await login(page, 'chambers');

  // The main chamber is there from the start; add a second one.
  await page.goto('/settings/chambers');
  await expect(page.getByLabel('Name', { exact: true }).first()).toHaveValue('Main chamber');
  await page.getByLabel('Chamber name').fill('Ibn Sina');
  await page.getByLabel('Address').last().fill('Kalyanpur');
  await page.getByRole('button', { name: 'Add chamber' }).click();
  await expect(page.getByLabel('Name', { exact: true }).nth(1)).toHaveValue('Ibn Sina');

  // Main chamber's queue.
  await page.goto('/opd');
  await expect(myChamber(page)).toHaveValue(/.+/);
  await expect(myChamber(page).locator('option:checked')).toHaveText('Main chamber');
  await addNewToQueue(page, 'Labaid Patient');

  // Ibn Sina's queue is its own, and starts empty.
  await myChamber(page).selectOption({ label: 'Ibn Sina' });
  await expect(rows(page)).toHaveCount(0);
  await addNewToQueue(page, 'Ibn Sina Patient');
  await expect(rows(page)).toHaveCount(1);

  // Back to the main chamber: only its own patient.
  await myChamber(page).selectOption({ label: 'Main chamber' });
  await expect(rows(page).filter({ hasText: 'Labaid Patient' })).toBeVisible();
  await expect(rows(page).filter({ hasText: 'Ibn Sina Patient' })).toHaveCount(0);

  // The choice is kept across a reload on this device.
  await myChamber(page).selectOption({ label: 'Ibn Sina' });
  await expect(rows(page).filter({ hasText: 'Ibn Sina Patient' })).toBeVisible();
  await page.reload();
  await expect(myChamber(page).locator('option:checked')).toHaveText('Ibn Sina');
  await expect(rows(page).filter({ hasText: 'Ibn Sina Patient' })).toBeVisible();
});
