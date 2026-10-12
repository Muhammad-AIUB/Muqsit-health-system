import {
  API_URL, apiPatientsByMobile, assertGuard, createPatient, expect, fillLogin, guardContext, login, mobileLookup, newRxButton,
  seed, test, uniqueMobile,
} from './helpers';

// ⚕️ "My Personal Note for This Patient" is opened FOR a patient, and is that
// patient's until it is closed.
//
// It used to follow the editor's patient while it stood open. With "Mirror
// devices" on, a second device picking another patient from the search box
// moved the first device's editor on behind the open note — and what had been
// typed for one patient was saved into the next patient's private note, under
// the next patient's details (found by reading, in the fourth review,
// 2026-10-12; in production until the release that carried this). Two real
// browsers and the real mirror stream are the only way to see it happen, so
// this is where it is held.
//
// Every name and every word typed here is made up.

const NOTE = 'My Personal Note for This Patient';
const ALPHA = 'Note Patient Alpha';
const BETA = 'Note Patient Beta';
const WORDS = 'Made-up words about Alpha';

test('words typed in one patient\'s personal note are saved into THAT note, though another device has moved the editor on to the next patient', async ({ page, browser }) => {
  const alphaMobile = uniqueMobile();
  const betaMobile = uniqueMobile();

  // Device A: two patients on record, Alpha in the editor.
  await login(page, 'noteMirror');
  await createPatient(page, betaMobile, BETA);
  await newRxButton(page).click();
  await expect(mobileLookup(page)).toBeVisible();
  await createPatient(page, alphaMobile, ALPHA);

  // Device B: the same doctor in another browser (own cookies, own storage).
  const contextB = await browser.newContext();
  const guardB = await guardContext(contextB);
  try {
    const pageB = await contextB.newPage();
    // Not `login()`, which waits for an EMPTY editor: on this dev server the
    // same doctor's second sign-in comes up empty on one run and with the first
    // device's patient on the next (it depends on which of two requests lands
    // first). Either will do — B is about to follow A.
    const s = seed();
    await fillLogin(pageB, s.doctors.noteMirror.email, s.password);
    await expect(pageB).toHaveURL(/\/prescription$/, { timeout: 60_000 });
    await expect(pageB.getByRole('switch', { name: 'Mirror devices' })).toBeVisible({ timeout: 45_000 });

    // A turns mirroring on: B is switched on with it, and follows A to Alpha.
    const mirrorA = page.getByRole('switch', { name: 'Mirror devices' });
    await mirrorA.click();
    await expect(mirrorA).toHaveAttribute('aria-checked', 'true');
    await expect(pageB.getByRole('switch', { name: 'Mirror devices' })).toHaveAttribute('aria-checked', 'true');
    await expect(pageB.getByPlaceholder('Patient name')).toHaveValue(ALPHA);

    // A opens Alpha's note and types — nothing is saved yet.
    await page.getByRole('button', { name: NOTE }).click();
    const note = page.getByRole('dialog', { name: NOTE });
    await expect(note).toContainText(ALPHA);
    const editor = note.locator('[contenteditable="true"]');
    await editor.click();
    await page.keyboard.type(WORDS);
    await expect(editor).toHaveText(WORDS);

    // B picks Beta from the search box. A's editor moves on to Beta, behind
    // the open note.
    await pageB.getByPlaceholder(/Search by mobile/).fill(betaMobile);
    await pageB.getByRole('button', { name: new RegExp(BETA) }).click();
    await expect(pageB.getByPlaceholder('Patient name')).toHaveValue(BETA);
    await expect(page.getByPlaceholder('Patient name')).toHaveValue(BETA);

    // The note on A is still Alpha's: her details, the words as typed.
    await expect(note).toContainText(ALPHA);
    await expect(note).not.toContainText(BETA);
    await expect(editor).toHaveText(WORDS);

    await note.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(note.getByText(/Last saved/)).toBeVisible();

    // What the server holds, read with A's own session.
    const [alpha] = await apiPatientsByMobile(page, alphaMobile);
    const [beta] = await apiPatientsByMobile(page, betaMobile);
    const noteOf = async (patientId: string) => {
      const res = await page.request.get(`${API_URL}/patient-notes/${patientId}`);
      expect(res.status(), 'GET /patient-notes/:id').toBe(200);
      return ((await res.json()) as { note: { html: string; patientInfo: { name: string } } | null }).note;
    };
    const alphaNote = await noteOf(alpha.id);
    expect(alphaNote?.html).toContain(WORDS);
    expect(alphaNote?.patientInfo.name).toBe(ALPHA);
    expect(await noteOf(beta.id), "Beta's note").toBeNull();

    // Closed and opened again, it is the patient now in the editor — who has no note yet.
    await note.getByRole('button', { name: 'Close' }).click();
    await expect(note).toHaveCount(0);
    await page.getByRole('button', { name: NOTE }).click();
    const again = page.getByRole('dialog', { name: NOTE });
    await expect(again).toContainText(BETA);
    await expect(again).not.toContainText(WORDS);
  } finally {
    await contextB.close();
  }
  assertGuard(guardB);
});
