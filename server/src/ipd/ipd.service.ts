import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

  async create(doctorId: string, dto: CreateAdmissionDto): Promise<IpdAdmission> {
    const wardNo = await this.resolveWard(doctorId, dto.wardId, dto.wardNo);
    return this.prisma.$transaction(async (tx) => {
      await this.assertBedFree(tx, doctorId, dto.bed);
      return tx.ipdAdmission.create({
        data: { ...dto, ...wardNo, status: dto.status ?? 'Stable', doctorId },
      });
    });
  }

  /**
   * Check a wardId belongs to THIS doctor before it is written, and keep the
   * displayed `wardNo` in step with the ward's real name.
   *
   * Linking an admission to another practice's ward would put that practice's
   * team on this patient — the header is not the only way access can widen, a
   * foreign id in a body is too. An unknown ward is refused, not silently
   * dropped: quietly unlinking would leave the doctor believing the ward team
   * can see a patient it cannot.
   */
  private async resolveWard(
    doctorId: string,
    wardId: string | null | undefined,
    wardNo: string | undefined,
  ): Promise<{ wardId?: string | null; wardNo?: string }> {
    if (wardId === undefined) return {};
    if (wardId === null || wardId === '') {
      // Explicitly unlinked — keep whatever ward text was typed alongside.
      return { wardId: null, ...(wardNo !== undefined ? { wardNo } : {}) };
    }
    const ward = await this.prisma.ward.findFirst({
      where: { id: wardId, doctorId },
      select: { id: true, name: true },
    });
    if (!ward) throw new NotFoundException('That ward is not one of yours.');
    return { wardId: ward.id, wardNo: ward.name };
  }

  // Reject if another non-discharged admission for this doctor already occupies
  // the bed. A partial unique index on (doctorId, bed) WHERE status <> 'Discharge'
  // is the full guard (see prisma/manual-ipd-bed-unique.sql); this transactional
  // check keeps behavior correct on its own before the index is applied.
  private async assertBedFree(
    tx: Prisma.TransactionClient,
    doctorId: string,
    bed: string,
    excludeId?: string,
  ): Promise<void> {
    const occupant = await tx.ipdAdmission.findFirst({
      where: {
        doctorId,
        bed,
        status: { not: 'Discharge' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (occupant) throw new ConflictException(`Bed ${bed} is already occupied.`);
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
    return this.prisma.$transaction(async (tx) => {
      const admission = await tx.ipdAdmission.findFirst({ where: { id, doctorId } });
      if (!admission) throw new NotFoundException('Admission not found');
      // Re-admitting a discharged patient (Discharge → active) must re-check the
      // bed: it may have been reassigned to someone else while they were out.
      if (admission.status === 'Discharge' && dto.status !== 'Discharge') {
        await this.assertBedFree(tx, doctorId, admission.bed, id);
      }
      return tx.ipdAdmission.update({ where: { id }, data: { status: dto.status } });
    });
  }

  async update(
    doctorId: string,
    id: string,
    dto: UpdateAdmissionDto,
  ): Promise<IpdAdmission> {
    const ward = await this.resolveWard(doctorId, dto.wardId, dto.wardNo);
    return this.prisma.$transaction(async (tx) => {
      const admission = await tx.ipdAdmission.findFirst({ where: { id, doctorId } });
      if (!admission) throw new NotFoundException('Admission not found');
      // Only re-check occupancy when the bed actually changes.
      if (dto.bed !== undefined && dto.bed !== admission.bed) {
        await this.assertBedFree(tx, doctorId, dto.bed, id);
      }
      // Loose cast so this compiles before `prisma generate` learns the new
      // age / sex / clinical columns (regenerate to activate at runtime).
      const data = { ...dto, ...ward } as Record<string, unknown>;
      return tx.ipdAdmission.update({
        where: { id },
        data: data as Prisma.IpdAdmissionUpdateInput,
      });
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
