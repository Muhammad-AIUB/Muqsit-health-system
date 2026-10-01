// Seeds the throwaway load-test database for the k6 suite in /load.
//
//   TEST_DB_NAME=muqsit_load_test npx ts-node --transpile-only test/seed-load.ts
//
// `./support/env` MUST stay the first import: it forces DATABASE_URL to the
// Docker test database before Prisma reads server/.env (which is production).
import './support/env';
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { makeDoctor, TEST_PASSWORD } from './support/fixtures';
import { assertTestDatabase, assertTestDbUrl, resetDb } from './support/test-db';

const DOCTORS = 20;
const PATIENTS_PER_DOCTOR = 200;
const SAMPLE_PER_DOCTOR = 50;

async function main() {
  if (process.env.TEST_DB_NAME !== 'muqsit_load_test') {
    throw new Error('REFUSING TO RUN: seed-load only seeds TEST_DB_NAME=muqsit_load_test');
  }
  assertTestDbUrl(process.env.DATABASE_URL);
  const prisma = new PrismaClient();
  try {
    await assertTestDatabase(prisma);
    await resetDb(prisma);

    const doctors: {
      email: string;
      id: string;
      patients: { id: string; mobile: string }[];
    }[] = [];

    for (let d = 0; d < DOCTORS; d++) {
      const doctor = await makeDoctor(prisma);
      // Synthetic, globally distinct mobiles: 019 + 8 digits (doctor, patient).
      await prisma.patient.createMany({
        data: Array.from({ length: PATIENTS_PER_DOCTOR }, (_, p) => ({
          name: `Load Patient ${d + 1}-${p + 1}`,
          mobile: `019${String(d * 1000 + p).padStart(8, '0')}`,
          doctorId: doctor.id,
        })),
      });
      const sample = await prisma.patient.findMany({
        where: { doctorId: doctor.id },
        select: { id: true, mobile: true },
        orderBy: { mobile: 'asc' },
        take: SAMPLE_PER_DOCTOR,
      });
      doctors.push({
        email: doctor.email,
        id: doctor.id,
        patients: sample.map((s) => ({ id: s.id, mobile: s.mobile ?? '' })),
      });
    }

    const outDir = join(__dirname, '..', '..', 'load');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, '.seed.json'),
      JSON.stringify({ password: TEST_PASSWORD, doctors }, null, 1),
    );
    const [users, patients] = await Promise.all([prisma.user.count(), prisma.patient.count()]);
    console.log(`seeded ${users} doctors, ${patients} patients -> load/.seed.json`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
