import type { Patient, PrismaClient, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { TestApp } from './app';

// Synthetic identities only. Nothing here resembles a real person, and no
// fixture carries clinical content beyond what a test passes in explicitly.
export const TEST_PASSWORD = 'Test-Passw0rd!';

let seq = 0;
const next = () => {
  seq += 1;
  return seq;
};
// Cost 4: these hashes guard nothing, and cost 10 adds ~80 ms per user.
const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 4);

// An approved, verified, primary-tier doctor — the account that can work in
// its own workstation. Override any column to model another state.
export async function makeDoctor(
  prisma: PrismaClient,
  over: Partial<User> = {},
): Promise<User> {
  const n = next();
  return prisma.user.create({
    data: {
      email: `doctor${n}.${Date.now()}@test.invalid`,
      name: `Test Doctor ${n}`,
      passwordHash,
      role: 'professional',
      profession: 'doctor',
      mobile: `017${String(10000000 + n).slice(-8)}`,
      emailVerified: true,
      approvalStatus: 'approved',
      accountTier: 'primary',
      ...(over as object),
    },
  });
}

export async function makeAssistantLink(
  prisma: PrismaClient,
  doctorId: string,
  assistantId: string,
  permissions: string[] = [],
  status: 'active' | 'suspended' = 'active',
) {
  return prisma.assistant.create({
    data: { doctorId, assistantId, permissions, status },
  });
}

export async function makeSupervisor(
  prisma: PrismaClient,
  patientId: string,
  doctorId: string,
) {
  return prisma.patientSupervisor.create({ data: { patientId, doctorId } });
}

export async function makePatient(
  prisma: PrismaClient,
  doctorId: string,
  over: Partial<Patient> = {},
): Promise<Patient> {
  const n = next();
  return prisma.patient.create({
    data: {
      name: `Test Patient ${n}`,
      mobile: `019${String(10000000 + n).slice(-8)}`,
      doctorId,
      ...(over as object),
    },
  });
}

// Signs in through the real endpoint and returns the browser (cookie jar).
export async function loginAs(t: TestApp, user: Pick<User, 'email'>) {
  const agent = t.agent();
  const res = await agent
    .post('/api/auth/login')
    .send({ identifier: user.email, password: TEST_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`login failed for ${user.email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}
