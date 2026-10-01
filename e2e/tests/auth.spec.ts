import { API_URL, expect, fillLogin, login, mobileLookup, seed, test } from './helpers';

test.describe('sign in and out', () => {
  test('a wrong password shows an error and stays on the login page', async ({ page }) => {
    const { email } = seed().doctors.authWrong;
    await fillLogin(page, email, 'not-the-password');

    await expect(page.getByText('Invalid email/phone or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(mobileLookup(page)).toHaveCount(0);
    // No session was issued.
    expect((await page.request.get(`${API_URL}/auth/me`)).status()).toBe(401);
  });

  test('a correct login lands in the app, and a reload keeps the session', async ({ page }) => {
    const { email, name } = seed().doctors.authSession;
    await login(page, 'authSession');
    await expect(page.getByTitle(name)).toBeVisible(); // the account avatar

    await page.reload();

    await expect(page).toHaveURL(/\/prescription$/);
    await expect(mobileLookup(page)).toBeVisible();
    await expect(page.getByTitle(name)).toBeVisible();
    const me = await page.request.get(`${API_URL}/auth/me`);
    expect(me.status()).toBe(200);
    expect((await me.json()).email).toBe(email);
  });

  test('log out returns to the login page and ends the session', async ({ page }) => {
    const { name } = seed().doctors.authLogout;
    await login(page, 'authLogout');

    await page.getByTitle(name).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect((await page.request.get(`${API_URL}/auth/me`)).status()).toBe(401);

    // A protected page no longer opens.
    await page.goto('/prescription');
    await expect(page).toHaveURL(/\/login$/);
    await expect(mobileLookup(page)).toHaveCount(0);
  });
});
