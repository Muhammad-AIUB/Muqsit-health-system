import { NotFoundException } from '@nestjs/common';
import { PatientNotesService } from './patient-notes.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PatientsService } from '../patients/patients.service';

// ⚕️ The personal note is private to the SIGNED-IN USER. These tests pin the
// two ids to their two jobs: the workstation doctor only proves the patient is
// reachable, the user id is the only key a note is read or written under.

const make = (reachable = true) => {
  const findUnique = jest.fn().mockResolvedValue(null);
  const upsert = jest.fn(async (a: { create: Record<string, unknown> }) => ({ ...a.create, updatedAt: new Date() }));
  const prisma = { doctorPatientNote: { findUnique, upsert } } as unknown as PrismaService;
  const get = jest.fn(async () => {
    if (!reachable) throw new NotFoundException('Patient not found');
    return { id: 'p1' };
  });
  const patients = { get } as unknown as PatientsService;
  return { svc: new PatientNotesService(prisma, patients), findUnique, upsert, get };
};

const info = { name: 'Rahim', age: '42', sex: 'Male', address: 'Dhaka', mobile: '01712345678' };

describe('PatientNotesService — privacy', () => {
  it("reads the SIGNED-IN user's note, never the workstation doctor's", async () => {
    const { svc, findUnique, get } = make();
    await svc.get('assistant-1', 'owner-doc', 'p1');
    expect(get).toHaveBeenCalledWith('owner-doc', 'p1');
    expect(findUnique.mock.calls[0][0].where).toEqual({ userId_patientId: { userId: 'assistant-1', patientId: 'p1' } });
  });

  it("writes under the signed-in user's id", async () => {
    const { svc, upsert } = make();
    await svc.save('assistant-1', 'owner-doc', 'p1', { html: '<b>x</b>', patientInfo: info });
    const arg = upsert.mock.calls[0][0] as unknown as { where: unknown; create: { userId: string } };
    expect(arg.where).toEqual({ userId_patientId: { userId: 'assistant-1', patientId: 'p1' } });
    expect(arg.create.userId).toBe('assistant-1');
  });

  it('refuses a patient the caller cannot reach, before touching any note', async () => {
    const { svc, findUnique, upsert } = make(false);
    await expect(svc.get('u1', 'd1', 'p9')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.save('u1', 'd1', 'p9', { html: '', patientInfo: info })).rejects.toBeInstanceOf(NotFoundException);
    expect(findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('keeps the patient details from the FIRST save — a later save changes the note only', async () => {
    const { svc, upsert } = make();
    await svc.save('u1', 'd1', 'p1', { html: 'second', patientInfo: { ...info, address: 'moved' } });
    const arg = upsert.mock.calls[0][0] as unknown as { update: Record<string, unknown>; create: { patientInfo: unknown } };
    expect(arg.update).toEqual({ html: 'second' });
    expect(arg.create.patientInfo).toMatchObject({ address: 'moved' }); // only used when creating
  });
});
