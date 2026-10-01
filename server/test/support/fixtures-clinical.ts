import type { PrismaClient, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { TEST_PASSWORD } from './fixtures';

// Helpers for the prescription / IPD / regression integration specs.
//
// Every clinical-looking string here is copied from an existing unit spec
// (`prescriptions.service.spec.ts`, `rx-habits/blocks.spec.ts`,
// `ipd.service.spec.ts`) — they are test fixtures, not clinical guidance.

/** The header that selects another doctor's practice (see WorkstationGuard). */
export const WS = 'X-Workstation';

/** One ℞ line as the client sends it. */
export interface RxLine {
  drug: string;
  dose: string;
  duration: string;
  instruction: string;
  isNote?: boolean;
  isCont?: boolean;
  sf?: string;
}

// A medicine, a tapering pair (`isCont` on the second line, drug filled back in
// exactly as `savePrescription` does), and a free-typed note line.
export const RX_LINES: RxLine[] = [
  { drug: 'Tablet. Napa 500mg', dose: '1+1+1', duration: '7 days', instruction: 'food' },
  { drug: 'Capsule. Levat 4 mg', dose: '0+0+1', duration: '7 days', instruction: '', isCont: false, sf: '17 June 2026' },
  { drug: 'Capsule. Levat 4 mg', dose: '0+0+2', duration: 'Continue', instruction: '', isCont: true },
  { drug: 'Review sugar chart', dose: '', duration: '', instruction: '', isNote: true },
];

export const ADVICE = ['Insulin as before'];

export function rxBody(patientId: string, over: Record<string, unknown> = {}) {
  return {
    patientId,
    advice: ADVICE,
    items: RX_LINES,
    ...over,
  };
}

/** An admin account (skips the verification / approval gates at sign-in). */
export async function makeAdmin(prisma: PrismaClient): Promise<User> {
  return prisma.user.create({
    data: {
      email: `admin.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@test.invalid`,
      name: 'Test Admin',
      passwordHash: bcrypt.hashSync(TEST_PASSWORD, 4),
      role: 'admin',
      emailVerified: true,
      approvalStatus: 'approved',
    },
  });
}

let bedSeq = 0;
/** A request body for POST /ipd with a bed nobody else in the run uses. */
export function admissionBody(over: Record<string, unknown> = {}) {
  bedSeq += 1;
  return { bed: `T-${bedSeq}`, name: `Test Inpatient ${bedSeq}`, ...over };
}

/** The stored order-sheet pages of an admission, straight from the row. */
export async function storedSheets(prisma: PrismaClient, admissionId: string) {
  const row = await prisma.ipdAdmission.findUniqueOrThrow({ where: { id: admissionId } });
  const clinical = (row.clinical ?? {}) as Record<string, unknown>;
  return {
    clinical,
    sheets: (Array.isArray(clinical.analogueSheets) ? clinical.analogueSheets : []) as Array<
      Record<string, unknown>
    >,
  };
}
