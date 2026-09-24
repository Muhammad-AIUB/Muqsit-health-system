import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { PatientInfoDto, SavePatientNoteDto } from './dto/patient-note.dto';

export interface PatientNoteView {
  patientInfo: PatientInfoDto;
  html: string;
  updatedAt: Date;
}

/**
 * ⚕️ "My Personal Note for This Patient" — private to the SIGNED-IN USER.
 *
 * Two ids, two jobs, and they must never be swapped:
 *  • `workstationDoctorId` only proves the caller can reach this patient at
 *    all (the same `PatientsService.get` every patient route uses) — without
 *    it, a user could write a note against any patient id they guessed;
 *  • `userId` (the authenticated user) is the ONLY key the note is read or
 *    written under. An assistant inside Dr. X's workstation reads their own
 *    note, never Dr. X's; Dr. X never reads theirs.
 */
@Injectable()
export class PatientNotesService implements OnModuleInit {
  private readonly log = new Logger(PatientNotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1 FROM "DoctorPatientNote" LIMIT 1`;
    } catch (e) {
      this.log.error(
        'DoctorPatientNote is unreadable — personal patient notes are DEAD. Apply ' +
          `server/prisma/manual-doctor-patient-note.sql through the tunnel. Cause: ${String(e)}`,
      );
    }
  }

  async get(userId: string, workstationDoctorId: string, patientId: string): Promise<PatientNoteView | null> {
    await this.patients.get(workstationDoctorId, patientId); // 404 when unreachable
    const row = await this.prisma.doctorPatientNote.findUnique({
      where: { userId_patientId: { userId, patientId } },
      select: { patientInfo: true, html: true, updatedAt: true },
    });
    return row ? { patientInfo: row.patientInfo as PatientInfoDto, html: row.html, updatedAt: row.updatedAt } : null;
  }

  async save(userId: string, workstationDoctorId: string, patientId: string, dto: SavePatientNoteDto): Promise<PatientNoteView> {
    await this.patients.get(workstationDoctorId, patientId);
    const info: PatientInfoDto = {
      name: dto.patientInfo.name ?? '',
      age: dto.patientInfo.age ?? '',
      sex: dto.patientInfo.sex ?? '',
      address: dto.patientInfo.address ?? '',
      mobile: dto.patientInfo.mobile ?? '',
    };
    const row = await this.prisma.doctorPatientNote.upsert({
      where: { userId_patientId: { userId, patientId } },
      create: { userId, patientId, patientInfo: info as unknown as Prisma.InputJsonValue, html: dto.html },
      // The patient details stay as they were at the first save.
      update: { html: dto.html },
      select: { patientInfo: true, html: true, updatedAt: true },
    });
    return { patientInfo: row.patientInfo as PatientInfoDto, html: row.html, updatedAt: row.updatedAt };
  }
}
