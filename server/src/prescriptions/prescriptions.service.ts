import { Injectable, NotFoundException } from '@nestjs/common';
import { Prescription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrescriptionDto } from './dto/prescription.dto';

@Injectable()
export class PrescriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(doctorId: string, dto: CreatePrescriptionDto): Promise<Prescription> {
    // The patient must belong to this doctor OR be supervised by them (4.docx —
    // a supervising doctor prescribes fresh; the row carries their own doctorId,
    // so each doctor's prescriptions stay scoped to themselves).
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, OR: [{ doctorId }, { supervisors: { some: { doctorId } } }] },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const { patientId, items, ...fields } = dto;
    return this.prisma.prescription.create({
      data: {
        ...fields,
        patientId,
        doctorId,
        items: {
          create: items.map((item, i) => ({ ...item, order: item.order ?? i })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  listByPatient(doctorId: string, patientId: string): Promise<Prescription[]> {
    return this.prisma.prescription.findMany({
      where: { doctorId, patientId },
      orderBy: { createdAt: 'desc' },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  async get(doctorId: string, id: string): Promise<Prescription> {
    const rx = await this.prisma.prescription.findFirst({
      where: { id, doctorId },
      include: { items: { orderBy: { order: 'asc' } }, patient: true },
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }
}
