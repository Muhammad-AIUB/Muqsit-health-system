import { Injectable, NotFoundException } from '@nestjs/common';
import { OpdVisit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOpdVisitDto,
  SetRxStatusDto,
  UpdateOpdStatusDto,
} from './dto/opd.dto';

@Injectable()
export class OpdService {
  constructor(private readonly prisma: PrismaService) {}

  // Today's queue for this doctor.
  list(doctorId: string): Promise<OpdVisit[]> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.prisma.opdVisit.findMany({
      where: { doctorId, createdAt: { gte: startOfDay } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(doctorId: string, dto: CreateOpdVisitDto): Promise<OpdVisit> {
    // Token: T-<serial of today>, per doctor.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayCount = await this.prisma.opdVisit.count({
      where: { doctorId, createdAt: { gte: startOfDay } },
    });
    const token = `T-${String(todayCount + 1).padStart(2, '0')}`;

    return this.prisma.opdVisit.create({
      data: { ...dto, type: dto.type ?? 'New', doctorId, token },
    });
  }

  async setStatus(doctorId: string, id: string, dto: UpdateOpdStatusDto): Promise<OpdVisit> {
    const visit = await this.prisma.opdVisit.findFirst({ where: { id, doctorId } });
    if (!visit) throw new NotFoundException('Visit not found');
    return this.prisma.opdVisit.update({ where: { id }, data: { status: dto.status } });
  }

  // Upsert today's queue entry for a patient and set its prescription status
  // (incomplete | complete). Reuses an existing same-day visit for the patient
  // so a queued or already-flagged patient isn't duplicated.
  async setRxStatusByPatient(doctorId: string, dto: SetRxStatusDto): Promise<OpdVisit> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const existing = await this.prisma.opdVisit.findFirst({
      where: { doctorId, patientId: dto.patientId, createdAt: { gte: startOfDay } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return this.prisma.opdVisit.update({
        where: { id: existing.id },
        data: { rxStatus: dto.rxStatus },
      });
    }
    const todayCount = await this.prisma.opdVisit.count({
      where: { doctorId, createdAt: { gte: startOfDay } },
    });
    const token = `T-${String(todayCount + 1).padStart(2, '0')}`;
    return this.prisma.opdVisit.create({
      data: {
        doctorId,
        patientId: dto.patientId,
        name: dto.name ?? 'Patient',
        phone: dto.phone ?? null,
        age: dto.age ?? null,
        gender: dto.gender ?? null,
        type: 'Rx',
        rxStatus: dto.rxStatus,
        token,
      },
    });
  }
}
