import { Injectable, NotFoundException } from '@nestjs/common';
import { Patient, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto, UpdatePatientDto } from './dto/patient.dto';

// Every query is scoped to the signed-in doctor — one doctor can never
// see or touch another doctor's patients.
@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  list(doctorId: string, search?: string): Promise<Patient[]> {
    const where: Prisma.PatientWhereInput = { doctorId };
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { mobile: { contains: q } },
      ];
    }
    return this.prisma.patient.findMany({ where, orderBy: { updatedAt: 'desc' } });
  }

  listWatched(doctorId: string): Promise<Patient[]> {
    return this.prisma.patient.findMany({
      where: { doctorId, watched: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async get(doctorId: string, id: string): Promise<Patient> {
    const patient = await this.prisma.patient.findFirst({ where: { id, doctorId } });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  create(doctorId: string, dto: CreatePatientDto): Promise<Patient> {
    const { dob, ...rest } = dto;
    return this.prisma.patient.create({
      data: { ...rest, dob: dob ? new Date(dob) : null, doctorId },
    });
  }

  async update(doctorId: string, id: string, dto: UpdatePatientDto): Promise<Patient> {
    await this.get(doctorId, id); // ownership check
    const { dob, hmDrugDates, hmSelectedDrugs, familyMembers, ...rest } = dto;
    // Loose cast: new columns may not yet be in the generated client; the DB
    // columns exist so Postgres accepts them at runtime.
    const extra = rest as Record<string, unknown>;
    if (hmSelectedDrugs !== undefined) extra.hmSelectedDrugs = hmSelectedDrugs;
    if (familyMembers !== undefined) extra.familyMembers = familyMembers as Prisma.InputJsonValue;
    return this.prisma.patient.update({
      where: { id },
      data: {
        ...extra,
        ...(dob !== undefined ? { dob: dob ? new Date(dob) : null } : {}),
        ...(hmDrugDates !== undefined ? { hmDrugDates: hmDrugDates as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async remove(doctorId: string, id: string): Promise<{ id: string }> {
    await this.get(doctorId, id); // ownership check
    await this.prisma.patient.delete({ where: { id } });
    return { id };
  }
}
