import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { PatientFileKind } from './dto/patient-file.dto';

export interface Actor {
  userId: string;
  name: string;
}

export interface PatientFileView {
  id: string;
  kind: string;
  name: string;
  fileDate: string;
  url: string;
  size: number;
  addedByName: string | null;
  createdAt: Date;
}

const SECTION: Record<PatientFileKind, string> = {
  permission: 'Permissions',
  dicom: 'Imaging DICOM',
};

const VIEW = {
  id: true, kind: true, name: true, fileDate: true, url: true, size: true, addedByName: true, createdAt: true,
} as const;

/** A real dd/mm/yyyy date — 31/02/2026 is refused, not stored. */
export function isRealDdmmyyyy(s: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (!m) return false;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

export const dhakaToday = (now = new Date()): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: '2-digit', year: 'numeric' }).format(now);

/**
 * ⚕️ Signed permissions and Imaging DICOM files of a patient (physician's sheet
 * 07/11/2026). Who may do what — the Rule 2 column of the patient's record:
 *  • READ: anyone who reaches the patient (`PatientsService.get`);
 *  • ADD / REMOVE: the patient's OWNER practice only (`patient.doctorId ===
 *    doctorId`); a supervising doctor reaches the patient but does not write
 *    the record's files, as `PATCH /patients/:id` refuses them for the galleries.
 *    An assistant also needs `pt.info` (checked in the controller).
 * Removal is SOFT: the row and the file stay, with who removed it and when.
 */
@Injectable()
export class PatientFilesService implements OnModuleInit {
  private readonly log = new Logger(PatientFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1 FROM "PatientFile" LIMIT 1`;
    } catch (e) {
      this.log.error(
        'PatientFile is unreadable — Permissions and Imaging DICOM are DEAD. Apply ' +
          `server/prisma/manual-patient-files.sql through the tunnel. Cause: ${String(e)}`,
      );
    }
  }

  async list(doctorId: string, patientId: string, kind: PatientFileKind): Promise<PatientFileView[]> {
    await this.patients.get(doctorId, patientId); // 404 when unreachable
    return this.prisma.patientFile.findMany({
      where: { patientId, kind, removedAt: null },
      orderBy: { createdAt: 'desc' },
      select: VIEW,
    });
  }

  async add(
    doctorId: string,
    actor: Actor,
    patientId: string,
    kind: PatientFileKind,
    input: { name?: string; fileDate?: string; url: string; size: number; originalName: string },
  ): Promise<PatientFileView> {
    const patient = await this.assertOwner(doctorId, patientId);
    const fileDate = input.fileDate?.trim() || dhakaToday();
    if (!isRealDdmmyyyy(fileDate)) throw new BadRequestException('The date is not a real date (dd/mm/yyyy).');
    const stem = (input.originalName ?? '').replace(/\.[^.]*$/, '').trim();
    const name = (input.name?.trim() || (kind === 'permission' ? stem : '')).slice(0, 120);
    if (!name) throw new BadRequestException('Give the file a name.');
    const row = await this.prisma.patientFile.create({
      data: {
        patientId, kind, name, fileDate, url: input.url, size: input.size,
        originalName: (input.originalName ?? '').slice(0, 200),
        practiceDoctorId: doctorId, addedById: actor.userId, addedByName: actor.name.slice(0, 120),
      },
      select: VIEW,
    });
    await this.logActivity(doctorId, actor, patient, kind, `Added “${name}” (${fileDate})`);
    return row;
  }

  async remove(doctorId: string, actor: Actor, patientId: string, fileId: string): Promise<{ ok: true }> {
    const patient = await this.assertOwner(doctorId, patientId);
    const row = await this.prisma.patientFile.findFirst({ where: { id: fileId, patientId, removedAt: null } });
    if (!row) throw new NotFoundException('File not found');
    await this.prisma.patientFile.update({ where: { id: row.id }, data: { removedAt: new Date(), removedById: actor.userId } });
    await this.logActivity(doctorId, actor, patient, row.kind as PatientFileKind, `Removed “${row.name}” (${row.fileDate})`);
    return { ok: true };
  }

  /** 404 when unreachable, 403 unless the patient's own practice. */
  async assertMayWriteFiles(doctorId: string, patientId: string) {
    return this.assertOwner(doctorId, patientId);
  }

  private async assertOwner(doctorId: string, patientId: string) {
    const patient = await this.patients.get(doctorId, patientId);
    if (patient.doctorId !== doctorId) {
      throw new ForbiddenException("Only the patient's own doctor can add or remove their files");
    }
    return patient;
  }

  private async logActivity(
    doctorId: string,
    actor: Actor,
    patient: { id: string; name: string },
    kind: PatientFileKind,
    detail: string,
  ): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          doctorId,
          actorName: actor.name || 'Someone',
          section: SECTION[kind],
          detail: detail.slice(0, 400),
          patientName: (patient.name ?? '').slice(0, 200) || null,
          patientId: patient.id,
          action: 'added',
        },
      });
    } catch (e) {
      this.log.warn(`activity line not written: ${String(e)}`);
    }
  }
}
