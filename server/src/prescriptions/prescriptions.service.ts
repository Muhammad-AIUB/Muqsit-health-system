import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prescription, PrescriptionItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ROW_LOCK_TX } from '../prisma/row-lock';
import { forViewer } from '../patients/patients.service';
import { CreatePrescriptionDto } from './dto/prescription.dto';
import { RxHabitsService } from '../rx-habits/rx-habits.service';
import { DoctorPhrasesService } from '../doctor-phrases/doctor-phrases.service';
import { REPEAT_WINDOW_MS, sameContent } from './repeat';

@Injectable()
export class PrescriptionsService {
  private readonly log = new Logger(PrescriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly habits: RxHabitsService,
    private readonly phrases: DoctorPhrasesService,
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
    const lines = items.map((item, i) => ({ ...item, order: item.order ?? i }));

    // ⚕️ THE SAME PRESCRIPTION SENT AGAIN IS THE ONE ON RECORD (19/10/2026).
    // A save whose answer was lost on the way back (a connection that dropped
    // after this write) reads to the doctor as "not saved", and they press
    // again: before this, the visit was filed twice. The doctor's LATEST
    // prescription for this patient, from the last half hour, with every field
    // and every line the same (`repeat.ts`), is answered instead of a second
    // row — and teaches "Your usual" nothing a second time. One save per doctor
    // and patient at a time: a copy that arrives while the first is still being
    // written waits for it, and then finds it.
    const { rx, repeat } = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rx:${doctorId}:${patientId}`}))`;
      const latest = await tx.prescription.findFirst({
        where: { doctorId, patientId, createdAt: { gte: new Date(Date.now() - REPEAT_WINDOW_MS) } },
        orderBy: { createdAt: 'desc' },
        include: { items: { orderBy: { order: 'asc' } } },
      });
      if (latest && sameContent(latest, fields, lines)) return { rx: latest, repeat: true };
      const created = await tx.prescription.create({
        data: { ...fields, patientId, doctorId, items: { create: lines } },
        include: { items: { orderBy: { order: 'asc' } } },
      });
      return { rx: created, repeat: false };
    }, ROW_LOCK_TX);
    if (repeat) {
      this.log.log(`prescription ${rx.id} sent again — answered with the one on record`);
      // Said, so the client does not write this visit's audit lines twice.
      return { ...rx, repeat: true } as Prescription;
    }

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
      // The free-text sibling: the ADVICE lines and the ℞ note lines this
      // doctor wrote, learned under the same rules (completed prescriptions
      // only, distinct patients). Same try/catch — a suggestion is never worth
      // failing a saved prescription for.
      await this.phrases.recordFrom(doctorId, patientId, rx.id, {
        advice: rx.advice ?? [],
        noteTexts: rxItems.filter((i) => i.isNote).map((i) => i.drug),
      });
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
    // A supervisor's own Rx on another practice's patient must not carry
    // that owner's in-progress draft along with the patient row.
    // (The declared return type omits the included relations; the object keeps them.)
    return rx.patient ? ({ ...rx, patient: forViewer(rx.patient, doctorId) } as Prescription) : rx;
  }
}
