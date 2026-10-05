import { expect, test as base, type BrowserContext, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { API_URL, WEB_URL } from '../ports';

export { API_URL, WEB_URL };

// ── Seeded doctors (written by server/test/seed-e2e.ts in globalSetup) ──────
export type Role =
  | 'authWrong' | 'authSession' | 'authLogout'
  | 'rxGate' | 'rxSave' | 'rxDouble' | 'rxDoubleSync' | 'rxAlert'
  | 'restore' | 'isoA' | 'isoB' | 'printDefault' | 'printA4' | 'gateKeyboard' | 'probe';

interface Seed { password: string; doctors: Record<Role, { email: string; name: string }> }
let seedCache: Seed | null = null;
export function seed(): Seed {
  seedCache ??= JSON.parse(readFileSync(join(__dirname, '..', '.seed.json'), 'utf8')) as Seed;
  return seedCache;
}

// ── Safety net on every browser context ─────────────────────────────────────
// The suite may only ever talk to the test client (3100) and the test API
// (4200). Anything else — above all the developer's own API on :4000, whose
// database is production — is aborted and fails the test.
// Nothing else: the app serves its own font (client/public/fonts), so a request
// to Google Fonts now means the CDN link came back — which is exactly what
// broke the UI on a network that blocks Google.
const ALLOWED_ORIGINS = new Set([
  WEB_URL,
  new URL(API_URL).origin,
]);
const allowed = (url: URL) =>
  ['data:', 'blob:', 'about:'].includes(url.protocol) || ALLOWED_ORIGINS.has(url.origin);

export interface Guard { foreign: string[]; pageErrors: string[] }

export async function guardContext(context: BrowserContext): Promise<Guard> {
  const g: Guard = { foreign: [], pageErrors: [] };
  await context.route((url) => !allowed(url), (route) => {
    g.foreign.push(route.request().url());
    return route.abort();
  });
  // "Save & print" files a PNG of the sheet through POST /uploads/image, which
  // writes a real file into server/uploads/ on this machine. The snapshot is
  // best-effort by design (a failure never undoes the save), so it is refused
  // here rather than leaving two files on disk per saved prescription.
  await context.route(`${API_URL}/uploads/image`, (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"uploads are disabled in e2e"}' }));
  context.on('page', (p) => p.on('pageerror', (e) => g.pageErrors.push(e.message)));
  return g;
}

export function assertGuard(g: Guard) {
  expect(g.foreign, 'requests to a host other than the test client / test API').toEqual([]);
  expect(g.pageErrors, 'uncaught errors in the page').toEqual([]);
}

export const test = base.extend<{ guard: Guard }>({
  guard: [async ({ context }, use) => {
    const g = await guardContext(context);
    await use(g);
    assertGuard(g);
  }, { auto: true }],
});
export { expect };

// ── Data ────────────────────────────────────────────────────────────────────
let mobileSeq = 0;
/** A fresh 11-digit number, unique within and across runs of one database. */
export function uniqueMobile(): string {
  mobileSeq += 1;
  const stamp = String(Date.now() % 1_000_000).padStart(6, '0');
  return `015${stamp}${String(mobileSeq % 100).padStart(2, '0')}`;
}

// Neutral text only — no clinical content is invented here. "Napa" is a row of
// the seeded test `medicines` table (server/test/support/medicines.sql).
export const NAPA = { search: 'Napa', label: 'Tablet. Napa 500 mg', dose: '1+0+1', duration: '5 days' };
export const DIAGNOSIS = 'Test diagnosis';

// ── Selectors ───────────────────────────────────────────────────────────────
export const mobileLookup = (page: Page) => page.getByPlaceholder('01XXXXXXXXX');
export const saveAndPrint = (page: Page) => page.getByRole('button', { name: /^(Save & print prescription|Saving…)$/ });
export const newRxButton = (page: Page) => page.getByRole('button', { name: 'New Prescription' });
/** The trailing empty line of the ℞ pad. */
export const padTypingLine = (page: Page) => page.getByPlaceholder('Start typing a medicine or note…');
/** BRITTLE: `data-rx-row` is the pad's own drag/drop hook, not a test id. */
export const padRow = (page: Page, i: number) => page.locator(`[data-rx-row="${i}"]`);
export const printDialog = (page: Page) => page.getByRole('dialog', { name: 'Prescription' });
export const printFrame = (page: Page): FrameLocator => printDialog(page).frameLocator('iframe[title="Prescription"]');

// ── Steps ───────────────────────────────────────────────────────────────────
export async function fillLogin(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('Email address or phone').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function login(page: Page, role: Role) {
  const s = seed();
  await fillLogin(page, s.doctors[role].email, s.password);
  await expect(page).toHaveURL(/\/prescription$/, { timeout: 60_000 });
  await expect(mobileLookup(page)).toBeVisible();
}

/** Mobile lookup with an unknown number → "Add New" → name only. */
export async function createPatient(page: Page, mobile: string, name: string) {
  await mobileLookup(page).fill(mobile);
  await page.getByRole('button', { name: /No patient on this number/ }).click();
  await expect(page.getByText('Add new patient', { exact: true })).toBeVisible();
  await page.getByPlaceholder('Full name').fill(name);
  // Sex, date of birth and age are optional on this form and are left blank.
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(newRxButton(page)).toBeVisible();
  await expect(page.getByPlaceholder('Patient name')).toHaveValue(name);
}

/**
 * Waits until the page's main thread is idle, i.e. React has finished the
 * renders an edit set off. The ℞ pad and the prescription model sync through
 * two effects, and a second edit landing before the first has settled can send
 * them into a render loop (DEFECT-E1 in e2e/README.md) — a doctor's keystrokes
 * are a human distance apart, a script's are not.
 */
export async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestIdleCallback(() => resolve(), { timeout: 2_000 }));
  }));
}

/** Types a search into the pad's trailing line and picks a result from the dropdown. */
export async function addMedicine(
  page: Page,
  rowIndex: number,
  m: { search: string; label: string; dose?: string; duration?: string },
): Promise<Locator> {
  await padTypingLine(page).fill(m.search);
  const escaped = m.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.getByRole('button', { name: new RegExp(`^${escaped}`) }).click();
  const row = padRow(page, rowIndex);
  await expect(row.locator('input').first()).toHaveValue(m.label);
  await settle(page);
  if (m.dose !== undefined) {
    await row.getByPlaceholder('dose').fill(m.dose);
    await settle(page);
  }
  if (m.duration !== undefined) {
    await row.getByPlaceholder('duration').fill(m.duration);
    await row.getByPlaceholder('duration').blur();
    await settle(page);
  }
  return row;
}

/** Opens a clinical field's popup by its label, types one line, presses Done. */
export async function addFieldLine(page: Page, label: string, text: string) {
  await page.getByText(label, { exact: true }).click();
  await page.getByPlaceholder(`Type ${label.toLowerCase()} and press Enter...`).fill(text);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  // .first(): the activity feed lower on the page repeats the line once it has
  // been logged; the clinical column comes first in the document.
  await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  await settle(page);
}

/** Presses "Save & print" and waits for the sheet to be written into the frame. */
export async function saveAndOpenSheet(page: Page): Promise<FrameLocator> {
  await saveAndPrint(page).click();
  return waitForSheet(page);
}

export async function waitForSheet(page: Page): Promise<FrameLocator> {
  await expect(printDialog(page)).toBeVisible();
  const frame = printFrame(page);
  await expect(frame.locator('.sheet').first()).toBeVisible({ timeout: 60_000 });
  // The save flow ends after the (refused) gallery snapshot; the button reads
  // "Saving…" until then.
  await expect(saveAndPrint(page)).toHaveText('Save & print prescription', { timeout: 60_000 });
  return frame;
}

// ── The API, with the browser's own cookies ─────────────────────────────────
export interface ApiPatient { id: string; name: string; mobile: string | null }
export interface ApiRxItem { drug: string; dose: string; duration: string; instruction: string; isNote: boolean; isCont: boolean; order: number }
export interface ApiPrescription { id: string; patientId: string; finalDiagnosis: string[]; associatedIllness: string[]; items: ApiRxItem[] }

export async function apiPatientsByMobile(page: Page, mobile: string): Promise<ApiPatient[]> {
  const res = await page.request.get(`${API_URL}/patients/by-mobile?mobile=${mobile}`);
  expect(res.status(), 'GET /patients/by-mobile').toBe(200);
  return (await res.json()) as ApiPatient[];
}

export async function apiPrescriptions(page: Page, patientId: string): Promise<ApiPrescription[]> {
  const res = await page.request.get(`${API_URL}/prescriptions?patientId=${patientId}`);
  expect(res.status(), 'GET /prescriptions').toBe(200);
  return (await res.json()) as ApiPrescription[];
}
