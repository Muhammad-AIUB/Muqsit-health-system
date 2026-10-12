import { API_URL, ROUTE_SCRIPT, expect, fillLogin, login, mobileLookup, routeScriptIsHere, seed, test } from './helpers';

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

  // Every journey signs in through login(), which waits for the app page's own
  // script before it waits for the page. That wait must be FOR something: its
  // first version matched the sign-in page's script too, and was over before it
  // began. If the first check here ever fails, the dev server has started
  // sending that script ahead of sign-in and the wait has become a formality.
  test('the sign-in helper waits for a script that is not there before sign-in, and is after it', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    expect(await page.evaluate(routeScriptIsHere, ROUTE_SCRIPT), "the app page's script, on the sign-in page").toBe(false);
    await login(page, 'loginWait');
    expect(await page.evaluate(routeScriptIsHere, ROUTE_SCRIPT), "the app page's script, after sign-in").toBe(true);
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
