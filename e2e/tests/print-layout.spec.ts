import {
  API_URL, DIAGNOSIS, NAPA, addFieldLine, addMedicine, createPatient, expect, login, mobileLookup,
  printDialog, saveAndOpenSheet, test, uniqueMobile,
} from './helpers';
import type { Frame, Page } from '@playwright/test';

const PX_PER_IN = 96;
const PT_PER_IN = 72;

interface Layout {
  sheet: { width: number; minHeight: number };
  table: { scrollWidth: number; clientWidth: number } | null;
  doc: { scrollWidth: number; clientWidth: number };
  /** Elements whose box leaves the sheet sideways. */
  overflowing: string[];
}

/** Measures the first sheet of a prescription document. Runs inside that document. */
async function measure(target: Frame | Page): Promise<Layout> {
  return target.evaluate(async () => {
    if (document.fonts) await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const sheet = document.querySelector('.sheet') as HTMLElement;
    const box = sheet.getBoundingClientRect();
    const table = sheet.querySelector('.right table') as HTMLElement | null;
    const overflowing: string[] = [];
    for (const el of Array.from(sheet.querySelectorAll<HTMLElement>('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < box.left - 0.5 || r.right > box.right + 0.5) {
        overflowing.push(`<${el.tagName.toLowerCase()} class="${el.className}"> "${(el.textContent ?? '').trim().slice(0, 40)}" left=${r.left.toFixed(1)} right=${r.right.toFixed(1)} sheet=${box.left.toFixed(1)}..${box.right.toFixed(1)}`);
      }
    }
    return {
      sheet: { width: box.width, minHeight: parseFloat(getComputedStyle(sheet).minHeight) },
      table: table ? { scrollWidth: table.scrollWidth, clientWidth: table.clientWidth } : null,
      doc: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
      overflowing,
    };
  });
}

function expectFits(l: Layout, where: string) {
  expect(l.table, `${where}: the ℞ table is on the sheet`).not.toBeNull();
  expect(l.table!.scrollWidth, `${where}: the ℞ table does not scroll sideways`).toBeLessThanOrEqual(l.table!.clientWidth);
  expect(l.overflowing, `${where}: elements running off the sheet sideways`).toEqual([]);
  expect(l.doc.scrollWidth, `${where}: the document does not scroll sideways`).toBeLessThanOrEqual(l.doc.clientWidth);
}

/**
 * Saves a two-medicine prescription and checks the sheet against a page of
 * `widthIn` × `heightIn` inches: in the in-app sheet, under the print
 * stylesheet at that paper width, and in the PDF Chromium prints from it.
 */
async function saveAndCheckSheet(page: Page, name: string, widthIn: number, heightIn: number) {
  await createPatient(page, uniqueMobile(), name);
  await addMedicine(page, 0, NAPA);
  await addMedicine(page, 1, { search: 'Napa', label: 'Syrup. Napa 120 mg/5 ml', dose: NAPA.dose, duration: NAPA.duration });
  await addFieldLine(page, 'Final diagnosis', DIAGNOSIS);
  await saveAndOpenSheet(page);

  // ── As shown in the in-app print sheet ───────────────────────────────────
  const frameHandle = await printDialog(page).locator('iframe[title="Prescription"]').elementHandle();
  const frame = (await frameHandle!.contentFrame())!;
  const onScreen = await measure(frame);
  expect(Math.abs(onScreen.sheet.width - widthIn * PX_PER_IN), `sheet width ${onScreen.sheet.width}px`).toBeLessThan(1);
  expect(Math.abs(onScreen.sheet.minHeight - heightIn * PX_PER_IN), `sheet min-height ${onScreen.sheet.minHeight}px`).toBeLessThan(1);
  expectFits(onScreen, 'in-app sheet');

  // ── As the printer sees it ───────────────────────────────────────────────
  // The identical document in a window as wide as the paper, with the print
  // stylesheet applied — the frame's own print() dialog cannot be driven.
  const html = await frame.content();
  const paper = await page.context().newPage();
  await paper.setViewportSize({ width: Math.round(widthIn * PX_PER_IN), height: Math.round(heightIn * PX_PER_IN) });
  await paper.setContent(html, { waitUntil: 'load' });
  await paper.emulateMedia({ media: 'print' });
  const printed = paper.locator('.sheet').first();
  await expect(printed).toContainText(name);
  await expect(printed).toContainText(NAPA.label);
  await expect(printed).toContainText('Syrup. Napa 120 mg/5 ml');
  await expect(printed).toContainText(DIAGNOSIS);
  expectFits(await measure(paper), 'print stylesheet at paper width');

  // And the PDF Chromium produces is ONE page of that size — a short
  // prescription that spilled onto a second sheet would be a layout fault.
  const pdf = (await paper.pdf({ preferCSSPageSize: true })).toString('latin1');
  expect(pdf.match(/\/Type\s*\/Page\b(?!s)/g) ?? [], 'pages in the printed PDF').toHaveLength(1);
  const box = pdf.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  expect(box, 'the PDF states its page size').not.toBeNull();
  expect(Math.abs(Number(box![3]) - widthIn * PT_PER_IN), `PDF page width ${box![3]}pt`).toBeLessThan(1.5);
  expect(Math.abs(Number(box![4]) - heightIn * PT_PER_IN), `PDF page height ${box![4]}pt`).toBeLessThan(1.5);
  await paper.close();
}

test.describe('the printed sheet fits its page', () => {
  test('A4: nothing runs off the page sideways', async ({ page }) => {
    await login(page, 'printA4');
    // This doctor's Prescription settings: an A4 page (the same numbers
    // prescriptionDoc.ts falls back to), saved through the real settings route.
    const saved = await page.request.put(`${API_URL}/prescription-layout`, {
      data: { unit: 'in', totalWidth: '8.27', totalHeight: '11.69' },
    });
    expect(saved.ok()).toBe(true);
    await page.reload(); // the editor reads the layout when it loads
    await expect(mobileLookup(page)).toBeVisible();

    await saveAndCheckSheet(page, 'Print A4 Patient', 8.27, 11.69);
  });

  test('default page of a new account (8.25 × 11 in): nothing runs off the page sideways', async ({ page }) => {
    await login(page, 'printDefault');
    const layout = await (await page.request.get(`${API_URL}/prescription-layout`)).json();
    expect([layout.unit, layout.totalWidth, layout.totalHeight]).toEqual(['in', '8.25', '11']);

    await saveAndCheckSheet(page, 'Print Default Patient', 8.25, 11);
  });
});
