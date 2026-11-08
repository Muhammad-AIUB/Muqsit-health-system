import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { isRealDdmmyyyy, PatientFilesService } from './patient-files.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PatientsService } from '../patients/patients.service';

// ⚕️ Permissions and Imaging DICOM files (physician's sheet 07/11/2026): anyone
// who reaches the patient READS; only the patient's OWNER practice writes;
// removal is soft.

const make = (patient: { id: string; name: string; doctorId: string | null } | null = { id: 'p1', name: 'Rahim', doctorId: 'owner' }) => {
  const create = jest.fn(async (a: { data: Record<string, unknown> }) => ({ id: 'f1', ...a.data, createdAt: new Date() }));
  const findMany = jest.fn().mockResolvedValue([]);
  const findFirst = jest.fn().mockResolvedValue({ id: 'f1', kind: 'dicom', name: 'MRI', fileDate: '02/09/2026' });
  const update = jest.fn().mockResolvedValue({});
  const logCreate = jest.fn().mockResolvedValue({});
  const prisma = { patientFile: { create, findMany, findFirst, update }, activityLog: { create: logCreate } } as unknown as PrismaService;
  const get = jest.fn(async () => {
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  });
  return { svc: new PatientFilesService(prisma, { get } as unknown as PatientsService), create, findMany, findFirst, update, logCreate, get };
};
const actor = { userId: 'u1', name: 'Dr. A' };
const file = { url: 'https://api.example/uploads/x.dcm', size: 10, originalName: 'IM0001.dcm' };

describe('PatientFilesService', () => {
  it('the owner practice adds a DICOM file with its name and date, and one activity line is written', async () => {
    const { svc, create, logCreate } = make();
    await svc.add('owner', actor, 'p1', 'dicom', { name: ' MRI whole abdomen ', fileDate: '02/09/2026', ...file });
    expect(create.mock.calls[0][0].data).toMatchObject({ patientId: 'p1', kind: 'dicom', name: 'MRI whole abdomen', fileDate: '02/09/2026', practiceDoctorId: 'owner', addedById: 'u1' });
    expect(logCreate.mock.calls[0][0].data).toMatchObject({ doctorId: 'owner', section: 'Imaging DICOM', patientId: 'p1' });
  });

  it("a supervising doctor reaches the patient but cannot add or remove a file — and nothing is written", async () => {
    const { svc, create, update } = make({ id: 'p1', name: 'Rahim', doctorId: 'someone-else' });
    await expect(svc.add('owner', actor, 'p1', 'dicom', { name: 'x', ...file })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.remove('owner', actor, 'p1', 'f1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('a patient the caller cannot reach is a 404 for every call', async () => {
    const { svc, findMany } = make(null);
    await expect(svc.list('owner', 'p1', 'dicom')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.add('owner', actor, 'p1', 'permission', file)).rejects.toBeInstanceOf(NotFoundException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('a DICOM file must be named; a permission falls back to the file name', async () => {
    const { svc, create } = make();
    await expect(svc.add('owner', actor, 'p1', 'dicom', file)).rejects.toBeInstanceOf(BadRequestException);
    await svc.add('owner', actor, 'p1', 'permission', { ...file, originalName: 'consent form.jpg' });
    expect(create.mock.calls[0][0].data.name).toBe('consent form');
  });

  it('a date that is not a real date is refused, and an absent one is today (Dhaka)', async () => {
    const { svc, create } = make();
    await expect(svc.add('owner', actor, 'p1', 'dicom', { name: 'x', fileDate: '31/02/2026', ...file })).rejects.toBeInstanceOf(BadRequestException);
    await svc.add('owner', actor, 'p1', 'dicom', { name: 'x', ...file });
    expect(create.mock.calls[0][0].data.fileDate).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(isRealDdmmyyyy('29/02/2028')).toBe(true);
    expect(isRealDdmmyyyy('29/02/2027')).toBe(false);
  });

  it('removal is soft: removedAt and who, never a delete', async () => {
    const { svc, update } = make();
    await svc.remove('owner', actor, 'p1', 'f1');
    expect(update.mock.calls[0][0].data).toMatchObject({ removedById: 'u1' });
    expect(update.mock.calls[0][0].data.removedAt).toBeInstanceOf(Date);
  });

  it('the list holds only what is not removed, of the asked kind', async () => {
    const { svc, findMany } = make();
    await svc.list('owner', 'p1', 'permission');
    expect(findMany.mock.calls[0][0].where).toEqual({ patientId: 'p1', kind: 'permission', removedAt: null });
  });
});
