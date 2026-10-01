import { createPatient, expect, login, padTypingLine, test, uniqueMobile } from './helpers';

// Probes for defects that do NOT fail on every run. They are skipped in the
// normal suite — an intermittent test marked `test.fail()` would itself be
// flaky — and run on demand:
//
//   E2E_PROBES=1 npx playwright test defect-probes
test.describe('defect probes (opt-in)', () => {
  test.skip(!process.env.E2E_PROBES, 'set E2E_PROBES=1 to run the intermittent-defect probes');

  // DEFECT-E1 (intermittent): typing into the ℞ pad faster than the editor
  // re-renders can crash it with "Maximum update depth exceeded" (raised from
  // MedicinePad.tsx `setAcPos`, see e2e/evidence/DEFECT-E1-render-loop.png).
  // Seen in 3 of ~25 fast-typing trials while exploring, never at a typing
  // interval the page kept up with. The CPU is slowed here to stand in for a
  // slow clinic PC; even so a single run may well pass.
  test('fast typing into the ℞ pad on a slow machine does not crash the editor', async ({ page, guard }) => {
    test.setTimeout(300_000);
    await login(page, 'probe');
    await createPatient(page, uniqueMobile(), 'Probe Patient');

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    try {
      for (let round = 0; round < 12 && guard.pageErrors.length === 0; round++) {
        await padTypingLine(page).focus({ timeout: 10_000 }).catch(() => {});
        await page.keyboard.type('Test note line', { delay: 0 });
        await page.waitForTimeout(1_500);
      }
    } finally {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }

    expect(guard.pageErrors, 'uncaught errors while typing').toEqual([]);
    await expect(padTypingLine(page)).toBeVisible();
  });
});
