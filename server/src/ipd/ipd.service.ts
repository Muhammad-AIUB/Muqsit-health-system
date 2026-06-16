import { Injectable, NotFoundException } from '@nestjs/common';
import { IpdAdmission, IpdEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateAdmissionDto,
  CreateIpdEventDto,
  UpdateAdmissionDto,
  UpdateAdmissionStatusDto,
} from './dto/ipd.dto';

@Injectable()
export class IpdService {
  constructor(private readonly prisma: PrismaService) {}

  list(doctorId: string): Promise<IpdAdmission[]> {
    return this.prisma.ipdAdmission.findMany({
      where: { doctorId },
      orderBy: { admittedAt: 'asc' },
    });
  }

  create(doctorId: string, dto: CreateAdmissionDto): Promise<IpdAdmission> {
    return this.prisma.ipdAdmission.create({
      data: { ...dto, status: dto.status ?? 'Stable', doctorId },
    });
  }

  private async owned(doctorId: string, id: string): Promise<IpdAdmission> {
    const admission = await this.prisma.ipdAdmission.findFirst({ where: { id, doctorId } });
    if (!admission) throw new NotFoundException('Admission not found');
    return admission;
  }

  async setStatus(
    doctorId: string,
    id: string,
    dto: UpdateAdmissionStatusDto,
  ): Promise<IpdAdmission> {
    await this.owned(doctorId, id);
    return this.prisma.ipdAdmission.update({ where: { id }, data: { status: dto.status } });
  }

  async update(
    doctorId: string,
    id: string,
    dto: UpdateAdmissionDto,
  ): Promise<IpdAdmission> {
    await this.owned(doctorId, id);
    // Loose cast so this compiles before `prisma generate` learns the new
    // age / sex / clinical columns (regenerate to activate at runtime).
    const data = { ...dto } as Record<string, unknown>;
    return this.prisma.ipdAdmission.update({
      where: { id },
      data: data as Prisma.IpdAdmissionUpdateInput,
    });
  }

  async listEvents(doctorId: string, admissionId: string): Promise<IpdEvent[]> {
    await this.owned(doctorId, admissionId);
    return this.prisma.ipdEvent.findMany({
      where: { admissionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addEvent(
    doctorId: string,
    admissionId: string,
    author: string,
    dto: CreateIpdEventDto,
  ): Promise<IpdEvent> {
    await this.owned(doctorId, admissionId);
    return this.prisma.ipdEvent.create({
      data: { ...dto, admissionId, author },
    });
  }
}
