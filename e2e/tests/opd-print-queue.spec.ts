import type { Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { API_URL, expect, login, test } from './helpers';

// "Print Queue" on the OPD tab (physician's sheet, 28/10/2026): a preview of an A4
// sheet of the open day's patients. Real browser, real API, throwaway database;
// every name and number is made up. What jsdom cannot show is held here: the sheet
// in its own frame, how many printed pages it is, the table head on page 2, no row
// split, the phone header, and the keys while the preview is open.
//
// Uses its own seeded doctor, `opdPrintQueue`, who queues patients on TODAY.

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
void DAY_MS;

const OUT = join(__dirname, '..', 'test-results', 'print-queue');

const LONG_NAME = 'Abdul Rahman Mohammad Shamsuddin Ahmed Chowdhury Al-Mahmud Siddique Bin Karim Hossain';
const NO_DATA = 'Printq NoDetails Patient';
const AGE_ZERO = 'Printq Newborn Zero';
const N = 40;

interface Entry { name: string; phone?: string; age?: number; gender?: string }

function entries(): Entry[] {
  const list: Entry[] = [];
  for (let i = 1; i <= N; i++) {
    const n = String(i).padStart(2, '0');
    list.push({
      name: `Printq Patient ${n}`,
      phone: `0177${String(7000000 + i * 37).slice(0, 7)}`,
      age: 20 + i,
      gender: i % 3 === 0 ? 'F' : i % 3 === 1 ? 'Male' : 'Female',
    });
  }
  list[4] = { name: LONG_NAME, phone: '01799999999', age: 47, gender: 'Female' };
  list[9] = { name: NO_DATA }; // no age, no sex, no mobile
  list[14] = { name: AGE_ZERO, phone: '01788888888', age: 0, gender: 'Male' };
  return list;
}

interface ApiVisit { name: string; phone: string | null; age: number | null; gender: string | null }

async function seedDay(page: Page): Promise<ApiVisit[]> {
  const have = await page.request.get(`${API_URL}/opd?date=${TODAY}`);
  if (have.status() === 200 && ((await have.json()) as ApiVisit[]).length === N) return (await have.json()) as ApiVisit[];
  // One saved schedule for the day, so every serial is told a time.
  const sched = await page.request.put(`${API_URL}/opd/schedule`, {
    data: { date: TODAY, startTime: '09:00', breakStart: '11:00', breakEnd: '11:30', minutesPerPatient: 10 },
  });
  expect(sched.status(), 'PUT /opd/schedule').toBeLessThan(300);
  for (const e of entries()) {
    const res = await page.request.post(`${API_URL}/opd`, { data: { ...e, date: TODAY } });
    expect(res.status(), `POST /opd ${e.name}`).toBeLessThan(300);
  }
  const res = await page.request.get(`${API_URL}/opd?date=${TODAY}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as ApiVisit[];
}

const printButton = (page: Page) => page.getByRole('button', { name: 'Print Queue' });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'OPD queue' });
const frame = (page: Page) => dialog(page).frameLocator('iframe[title="OPD queue"]');

async function openSheet(page: Page) {
  await expect(printButton(page)).toBeEnabled();
  await printButton(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(frame(page).locator('table')).toBeVisible();
}

/** The sheet's document as the frame holds it. */
const sheetHtml = (page: Page) =>
  page.locator('iframe[title="OPD queue"]').evaluate((f) => {
    const d = (f as HTMLIFrameElement).contentDocument!;
    return '<!doctype html>' + d.documentElement.outerHTML;
  });

test.describe('OPD → Print Queue', () => {
  test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

  test('the sheet lists the day in serial order, with dashes, and prints on more than one A4 page', async ({ page, context }) => {
    await login(page, 'opdPrintQueue');
    const stored = await seedDay(page);
    expect(stored).toHaveLength(N);
    await page.goto('/opd');
    await expect(page.locator('.queue-row')).toHaveCount(N);

    // What the OPD screen shows, to compare the sheet against.
    const screenTimes = (await page.locator('.queue-row [data-time]').allInnerTexts()).map((t) => t.trim());
    expect(screenTimes).toHaveLength(N);

    await openSheet(page);
    await page.screenshot({ path: join(OUT, 'preview-open.png') });
    const f = frame(page);

    // ── Header ────────────────────────────────────────────────────────────────
    await expect(f.locator('[data-doctor]')).toContainText('opdPrintQueue');
    await expect(f.locator('.meta')).toContainText(`Total patients: ${N}`);
    await expect(f.locator('.meta')).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    await expect(f.locator('thead th')).toHaveText(['Serial', 'Name', 'Gender', 'Age', 'Mobile', 'Appointment time']);

    // ── Every patient, in serial order, as the server holds them ───────────────
    const cells = await f.locator('tbody tr').evaluateAll((trs) =>
      trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent ?? '').trim())));
    expect(cells).toHaveLength(N);
    expect(cells.map((c) => c[0])).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)));
    expect(cells.map((c) => c[1])).toEqual(stored.map((v) => v.name));
    // No name is cut: the 90-character one is whole.
    expect(LONG_NAME.length).toBeGreaterThanOrEqual(80);
    expect(cells.some((c) => c[1] === LONG_NAME)).toBe(true);

    // A dash stands for what is not recorded — and only for that.
    const noData = cells.find((c) => c[1] === NO_DATA)!;
    expect(noData.slice(2, 5)).toEqual(['—', '—', '—']);
    const zero = cells.find((c) => c[1] === AGE_ZERO)!;
    expect(zero[3], 'age 0 is an age, not a missing one').toBe('0y');
    expect(zero[2]).toBe('Male');
    for (const [i, c] of cells.entries()) {
      const v = stored[i];
      expect(c[4], `mobile of ${v.name}`).toBe(v.phone?.trim() ? v.phone : '—');
      expect(c[3], `age of ${v.name}`).toBe(v.age == null ? '—' : `${v.age}y`);
    }
    // Sex words: the F/M letters some rows carry are written out.
    expect(cells.map((c) => c[2]).every((g) => ['Male', 'Female', 'Other', '—'].includes(g))).toBe(true);

    // The times are the ones the OPD screen shows.
    const norm = (t: string) => t.replace(/\s+/g, '').toLowerCase();
    expect(cells.map((c) => norm(c[5]))).toEqual(screenTimes.map(norm));

    // Nothing leaves the sheet sideways, in the frame.
    const overflow = await f.locator('body').evaluate((b) => {
      const w = b.ownerDocument.documentElement;
      const cut = Array.from(b.querySelectorAll('td')).filter((td) => td.scrollWidth > td.clientWidth + 1).length;
      return { page: w.scrollWidth - w.clientWidth, cut };
    });
    expect(overflow).toEqual({ page: 0, cut: 0 });

    // ── Printed: A4 pages, head repeated, no row split ─────────────────────────
    const html = await sheetHtml(page);
    writeFileSync(join(OUT, 'sheet.html'), html);
    const printPage = await context.newPage();
    await printPage.setContent(html);
    await printPage.emulateMedia({ media: 'print' });
    const pdf = await printPage.pdf({ preferCSSPageSize: true, printBackground: true });
    writeFileSync(join(OUT, 'sheet.pdf'), pdf);
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages, 'A4 pages of the printed sheet').toBeGreaterThan(1);
    // A4 media box: 595 x 842 pt.
    expect(pdf.toString('latin1')).toMatch(/\/MediaBox\s*\[\s*0\s+0\s+59[45](\.\d+)?\s+84[12](\.\d+)?\s*\]/);
    writeFileSync(join(OUT, 'pages.txt'), String(pages));
    // The page's own scroll width under print rules: nothing sideways.
    const printOverflow = await printPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(printOverflow).toBeLessThanOrEqual(0);
    await printPage.close();
  });

  // Was DEFECT-PQ-WRAP (found 30/10/2026): the Name column took all the spare width, so
  // "Female" printed as "Femal / e" and an 11-digit mobile number was split over two
  // lines. Gender, Age, Mobile and Time cells and the table head are now nowrap.
  test('printed: Female, mobile numbers and the head stay on one line; the long name wraps whole', async ({ page, context }) => {
    await login(page, 'opdPrintQueue');
    await seedDay(page);
    await page.goto('/opd');
    await expect(page.locator('.queue-row')).toHaveCount(N);
    await openSheet(page);
    const html = await sheetHtml(page);
    const printPage = await context.newPage();
    await printPage.setContent(html);
    await printPage.emulateMedia({ media: 'print' });
    await printPage.setViewportSize({ width: 794, height: 1123 });
    const lines = (sel: string) => printPage.evaluate((q) =>
      Array.from(document.querySelectorAll(q)).map((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return { text: (el.textContent ?? '').trim(), lines: new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top))).size };
      }), sel);
    const gender = await lines('tbody td:nth-child(3)');
    expect(gender.filter((g) => g.text === 'Female').length).toBeGreaterThan(0);
    expect(gender.filter((g) => g.lines !== 1)).toEqual([]);
    const mobile = await lines('tbody td:nth-child(5)');
    expect(mobile.filter((m) => /^\d{11}$/.test(m.text)).length).toBeGreaterThan(0);
    expect(mobile.filter((m) => m.lines !== 1)).toEqual([]);
    const time = await lines('tbody td:nth-child(6)');
    expect(time.filter((t) => t.lines !== 1)).toEqual([]);
    const head = await lines('thead th');
    expect(head.filter((h) => h.lines !== 1), 'every head cell on one line, "Appointment time" included').toEqual([]);
    // The long name still wraps INSIDE its cell, whole.
    const name = await printPage.evaluate((long) => {
      const td = Array.from(document.querySelectorAll('tbody td:nth-child(2)')).find((e) => e.textContent?.trim() === long) as HTMLElement | undefined;
      if (!td) return null;
      const r = document.createRange();
      r.selectNodeContents(td);
      return { lines: new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top))).size, fits: td.scrollWidth <= td.clientWidth + 1 };
    }, LONG_NAME);
    expect(name).not.toBeNull();
    expect(name!.lines).toBeGreaterThan(1);
    expect(name!.fits).toBe(true);
    // The whole sheet is still on the page sideways.
    expect(await printPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    // The PDF is kept for the PDF-text check (pypdfium2) that follows the run.
    const pdf = await printPage.pdf({ preferCSSPageSize: true, printBackground: true });
    writeFileSync(join(OUT, 'sheet-fixed.pdf'), pdf);
    await printPage.close();
  });

  test('Escape closes the preview; Ctrl+P prints the sheet and not the app', async ({ page }) => {
    await login(page, 'opdPrintQueue');
    await page.goto('/opd');
    await expect(page.locator('.queue-row').first()).toBeVisible();
    await openSheet(page);

    // window.print counted on the sheet's own window and on the app's.
    await page.locator('iframe[title="OPD queue"]').evaluate((el) => {
      const w = (el as HTMLIFrameElement).contentWindow as unknown as { __printed: number; print: () => void };
      w.__printed = 0;
      w.print = () => { w.__printed += 1; };
    });
    await page.evaluate(() => {
      const w = window as unknown as { __printed: number; print: () => void };
      w.__printed = 0;
      w.print = () => { w.__printed += 1; };
    });
    const sheetPrints = () => page.locator('iframe[title="OPD queue"]').evaluate((el) => (
      (el as HTMLIFrameElement).contentWindow as unknown as { __printed: number }).__printed);
    const appPrints = () => page.evaluate(() => (window as unknown as { __printed: number }).__printed);

    // Focus inside the frame, as after a click to scroll the sheet.
    await frame(page).locator('table').click();
    await page.keyboard.press('Control+p');
    expect(await sheetPrints()).toBe(1);
    expect(await appPrints()).toBe(0);
    // Focus on the app side of the dialog (the Print button).
    await dialog(page).getByRole('button', { name: /Print/ }).first().focus();
    await page.keyboard.press('Control+p');
    expect(await sheetPrints()).toBe(2);
    expect(await appPrints()).toBe(0);

    // Escape closes — pressed inside the frame…
    await frame(page).locator('table').click();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    // …and pressed on the dialog's own button.
    await openSheet(page);
    await dialog(page).getByRole('button').first().focus();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
  });

  test('on a phone the OPD header wraps and the page does not scroll sideways', async ({ page }) => {
    await login(page, 'opdPrintQueue');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/opd');
    // The desktop layout is on the page for a render after a resize: wait for the phone's.
    await expect(page.getByText('Layout preview')).toHaveCount(0);
    const date = page.getByRole('button', { name: /^Date: / });
    await expect(date).toBeVisible();
    await expect(printButton(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add to queue' })).toBeVisible();
    await page.screenshot({ path: join(OUT, 'phone-header.png') });

    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      bsw: document.body.scrollWidth,
    }));
    expect(m.sw, `page scrollWidth ${m.sw} vs ${m.cw}`).toBeLessThanOrEqual(m.cw);
    // Each of the three buttons lies inside the screen.
    for (const b of [date, printButton(page), page.getByRole('button', { name: '+ Add to queue' })]) {
      const box = (await b.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375 + 0.5);
    }
  });
});
