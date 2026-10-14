// Seeds the throwaway E2E database for the Playwright suite (e2e/).
//
//   TEST_DB_NAME=muqsit_e2e_test npx ts-node --transpile-only test/seed-e2e.ts
//
// `./support/env` MUST stay the first import: it points DATABASE_URL at the
// test container before Prisma is loaded, and refuses anything else. The dev
// DATABASE_URL in server/.env is production.
import './support/env';
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { TEST_PASSWORD, makeDoctor } from './support/fixtures';
import { assertTestDatabase, assertTestDbUrl, resetDb } from './support/test-db';

// One doctor per TEST, so no journey depends on another one's state: the editor
// draft is stored per doctor, and a doctor with no earlier draft has nothing
// that could be restored into the next test's editor.
const ROLES = [
  'authWrong', 'authSession', 'authLogout',
  'rxGate', 'rxSave', 'rxDouble', 'rxDoubleSync', 'rxAlert',
  'restore', 'isoA', 'isoB', 'printDefault', 'printA4', 'gateKeyboard', 'probe',
  'sheetSave', 'sheetKeys', 'sheetEnter', 'headerSwitch', 'noteMirror',
  'invUnits', 'invUnitsPlain', 'loginWait', 'bulkMed', 'bulkKeys', 'bulkOffline', 'bulkPhone', 'bulkMany', 'moveRx',
  'monthlyCost',
] as const;

// The "Total monthly approximate cost" journey prices from the medicine chart:
// two strengths of one made-up medicine at two prices, written in the chart's
// own shape. (The six rows of `support/medicines.sql` carry no price.)
const PRICED: [string, string, string, string][] = [
  ['e2e-price-20', 'Capsule (Enteric Coated)', '20 mg', 'Unit Price: ৳ 5.00 (10 x 10: ৳ 500.00)'],
  ['e2e-price-40', 'Capsule (Enteric Coated)', '40 mg', 'Unit Price: ৳ 1,150.00 (2 x 7: ৳ 16,100.00)'],
];

async function main() {
  assertTestDbUrl(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  try {
    await assertTestDatabase(prisma);
    await resetDb(prisma);
    // `medicines` is reference data that resetDb keeps.
    await prisma.$executeRawUnsafe(`DELETE FROM medicines WHERE id LIKE 'e2e-price-%'`);
    for (const [id, form, strength, price] of PRICED) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO medicines (id, "brandName", "genericName", "dosageForm", strength, company, "priceRaw")
         VALUES ($1, 'Zzcostcap', 'Made-up generic', $2, $3, 'Test Pharma', $4)`,
        id, form, strength, price,
      );
    }

    const doctors: Record<string, { email: string; name: string }> = {};
    for (const role of ROLES) {
      const u = await makeDoctor(prisma, { name: `E2E Doctor ${role}` });
      doctors[role] = { email: u.email, name: u.name };
    }

    const out = join(__dirname, '..', '..', 'e2e', '.seed.json');
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ password: TEST_PASSWORD, doctors }, null, 2));
    console.log(`seeded ${ROLES.length} doctors -> ${out}`);
    for (const role of ROLES) console.log(`  ${role}: ${doctors[role].email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
