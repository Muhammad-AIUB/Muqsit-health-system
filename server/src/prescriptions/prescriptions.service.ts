import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prescription, PrescriptionItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrescriptionDto } from './dto/prescription.dto';
import { RxHabitsService } from '../rx-habits/rx-habits.service';

@Injectable()
export class PrescriptionsService {
  private readonly log = new Logger(PrescriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly habits: RxHabitsService,
  ) {}

  async create(doctorId: string, dto: CreatePrescriptionDto): Promise<Prescription> {
    // The patient must belong to this doctor OR be supervised by them (4.docx —
    // a supervising doctor prescribes fresh; the row carries their own doctorId,
    // so each doctor's prescriptions stay scoped to themselves).
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, OR: [{ doctorId }, { supervisors: { some: { doctorId } } }] },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const { patientId, items, ...fields } = dto;
    const rx = await this.prisma.prescription.create({
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

    // ⚕️ THE PRESCRIPTION IS COMMITTED BEFORE ANYTHING BELOW CAN FAIL.
    //
    // Two things here are load-bearing, not style:
    //
    // 1. The habit write is OUTSIDE the prescription's write. Inside it, a
    //    habit-write failure would roll back a prescription the doctor believes
    //    was saved and has already printed. A habit is a convenience; the
    //    prescription is the record.
    // 2. It is AWAITED, not fire-and-forget. Every deploy restarts pm2, and a
    //    detached promise in flight at that moment is simply lost. Awaiting
    //    costs a few milliseconds on a save the doctor is already waiting on.
    //
    // Never allowed to fail the request — the catch is the whole point.
    try {
      const rxItems = (rx as Prescription & { items?: PrescriptionItem[] }).items ?? [];
      await this.habits.recordFrom(doctorId, patientId, rx.id, rxItems);
    } catch (e) {
      this.log.warn(`habit write failed for prescription ${rx.id}: ${String(e)}`);
    }

    return rx;
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
