import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { PatientDrugSafety } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from '../patients/patients.service';
import { ROW_LOCK_TX } from '../prisma/row-lock';
import { AddDrugSafetyDto, UpdateDrugSafetyDto } from './dto/drug-safety.dto';
import { entryLines, sameEntryKey } from './lines';

/** What the client is given for one entry. */
export interface DrugSafetyEntryView {
  id: string;
  kind: 'drug' | 'text';
  brand: string;
  generic: string | null;
  hypersensitive: boolean;
  highAlert: boolean;
  text: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  /** Whether the CALLER's practice may edit or remove it (see `mayChange`). */
  editable: boolean;
}

export interface Actor {
  userId: string;
  name: string;
}

const SECTION = 'Drug hypersensitivity / High-alert';

/**
 * ⚕️ "H/O drug hypersensitivity and High-Alert Medication" (physician's sheet,
 * 31/10/2026): a per-PATIENT list that stays with the patient for life.
 *
 * Reach is the patient's: `PatientsService.get(doctorId, id)` — the owner's
 * practice (and its assistants, through the workstation) and every supervising
 * doctor — and 404 for anyone else. The practice is ALWAYS the workstation
 * doctor the controller passes in; nothing here resolves one again.
 *
 * Who may change what (server/CLAUDE.md, Rule 2):
 *  • read — anyone who reaches the patient;
 *  • add — anyone who reaches the patient, a supervising doctor included: a
 *    hypersensitivity found by any prescribing doctor must be recordable;
 *  • edit / remove / restore — the owner's practice, any entry; a supervising
 *    practice, only the entries IT added. (An assistant's key is checked in
 *    the controller.)
 *
 * Nothing is ever deleted: removal sets `removedAt`, and restore clears it.
 */
@Injectable()
export class PatientDrugSafetyService implements OnModuleInit {
  private readonly log = new Logger(PatientDrugSafetyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
  ) {}

  // The doctor sees "could not be loaded" either way; the log names the cause.
  async onModuleInit(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1 FROM "PatientDrugSafety" LIMIT 1`;
    } catch (e) {
      this.log.error(
        'PatientDrugSafety is unreadable — the drug hypersensitivity / high-alert list is DEAD ' +
          '(the editor says it could not be loaded, and Save & print asks before printing ' +
          `without it). Apply server/prisma/manual-patient-drug-safety.sql. Cause: ${String(e)}`,
      );
    }
  }

  async list(
    doctorId: string,
    patientId: string,
  ): Promise<DrugSafetyEntryView[]> {
    const patient = await this.patients.get(doctorId, patientId); // 404 when unreachable
    const rows = await this.prisma.patientDrugSafety.findMany({
      where: { patientId, removedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.view(r, doctorId, patient.doctorId));
  }

  async add(
    doctorId: string,
    actor: Actor,
    patientId: string,
    dto: AddDrugSafetyDto,
  ): Promise<DrugSafetyEntryView> {
    const patient = await this.patients.get(doctorId, patientId);
    const data = this.clean(dto);
    const created = await this.prisma.$transaction(async (tx) => {
      // One add at a time per patient, so a double press cannot file the same
      // entry twice past the check below.
      await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${patientId} FOR UPDATE`;
      const live = await tx.patientDrugSafety.findMany({
        where: { patientId, removedAt: null },
      });
      const key = sameEntryKey(data);
      if (live.some((r) => sameEntryKey(r) === key)) {
        throw new ConflictException(
          data.kind === 'text'
            ? 'This line is already on the list.'
            : 'This medicine is already on the list. Use ✎ Edit to change what is ticked for it.',
        );
      }
      return tx.patientDrugSafety.create({
        data: {
          patientId,
          ...data,
          practiceDoctorId: doctorId,
          createdById: actor.userId,
          createdByName: actor.name.slice(0, 200),
        },
      });
    }, ROW_LOCK_TX);
    await this.logActivity(
      doctorId,
      actor,
      patient,
      'added',
      entryLines(created).join('; '),
    );
    return this.view(created, doctorId, patient.doctorId);
  }

  async update(
    doctorId: string,
    actor: Actor,
    patientId: string,
    entryId: string,
    dto: UpdateDrugSafetyDto,
  ): Promise<DrugSafetyEntryView> {
    const patient = await this.patients.get(doctorId, patientId);
    const row = await this.entry(patientId, entryId);
    if (row.removedAt)
      throw new NotFoundException('This entry has been removed.');
    this.assertMayChange(row, doctorId, patient.doctorId);
    let data: { hypersensitive?: boolean; highAlert?: boolean; text?: string };
    if (row.kind === 'text') {
      if (dto.hypersensitive !== undefined || dto.highAlert !== undefined) {
        throw new BadRequestException('A written line has nothing to tick.');
      }
      const text = (dto.text ?? '').trim();
      if (!text) throw new BadRequestException('Write the line, or remove it.');
      data = { text };
    } else {
      if (dto.text !== undefined)
        throw new BadRequestException(
          'A medicine entry is changed by its ticks.',
        );
      const hypersensitive = dto.hypersensitive ?? row.hypersensitive;
      const highAlert = dto.highAlert ?? row.highAlert;
      if (!hypersensitive && !highAlert) {
        throw new BadRequestException(
          'Tick at least one: hypersensitive, or high-alert medication.',
        );
      }
      data = { hypersensitive, highAlert };
    }
    const before = entryLines(row).join('; ');
    const updated = await this.prisma.patientDrugSafety.update({
      where: { id: row.id },
      data,
    });
    const after = entryLines(updated).join('; ');
    if (after !== before)
      await this.logActivity(
        doctorId,
        actor,
        patient,
        'saved',
        `Changed: ${before} → ${after}`,
      );
    return this.view(updated, doctorId, patient.doctorId);
  }

  async remove(
    doctorId: string,
    actor: Actor,
    patientId: string,
    entryId: string,
  ): Promise<{ id: string }> {
    const patient = await this.patients.get(doctorId, patientId);
    const row = await this.entry(patientId, entryId);
    this.assertMayChange(row, doctorId, patient.doctorId);
    if (!row.removedAt) {
      await this.prisma.patientDrugSafety.update({
        where: { id: row.id },
        data: { removedAt: new Date(), removedById: actor.userId },
      });
      await this.logActivity(
        doctorId,
        actor,
        patient,
        'saved',
        `Removed: ${entryLines(row).join('; ')}`,
      );
    }
    return { id: row.id };
  }

  async restore(
    doctorId: string,
    actor: Actor,
    patientId: string,
    entryId: string,
  ): Promise<DrugSafetyEntryView> {
    const patient = await this.patients.get(doctorId, patientId);
    const row = await this.entry(patientId, entryId);
    this.assertMayChange(row, doctorId, patient.doctorId);
    if (!row.removedAt) return this.view(row, doctorId, patient.doctorId);
    const restored = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${patientId} FOR UPDATE`;
      const live = await tx.patientDrugSafety.findMany({
        where: { patientId, removedAt: null },
      });
      const key = sameEntryKey(row);
      if (live.some((r) => sameEntryKey(r) === key)) {
        throw new ConflictException(
          'This entry is on the list again already, so it was not put back twice.',
        );
      }
      return tx.patientDrugSafety.update({
        where: { id: row.id },
        data: { removedAt: null, removedById: null },
      });
    }, ROW_LOCK_TX);
    await this.logActivity(
      doctorId,
      actor,
      patient,
      'added',
      `Put back: ${entryLines(restored).join('; ')}`,
    );
    return this.view(restored, doctorId, patient.doctorId);
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private clean(dto: AddDrugSafetyDto) {
    if (dto.kind === 'text') {
      const text = (dto.text ?? '').trim();
      if (!text) throw new BadRequestException('Write the line to add.');
      return {
        kind: 'text',
        brand: '',
        generic: null,
        hypersensitive: false,
        highAlert: false,
        text,
      };
    }
    const brand = (dto.brand ?? '').replace(/\s+/g, ' ').trim();
    if (!brand) throw new BadRequestException('Name the medicine.');
    const hypersensitive = dto.hypersensitive === true;
    const highAlert = dto.highAlert === true;
    if (!hypersensitive && !highAlert) {
      throw new BadRequestException(
        'Tick at least one: hypersensitive, or high-alert medication.',
      );
    }
    const generic = (dto.generic ?? '').replace(/\s+/g, ' ').trim() || null;
    return {
      kind: 'drug',
      brand,
      generic,
      hypersensitive,
      highAlert,
      text: '',
    };
  }

  private async entry(
    patientId: string,
    entryId: string,
  ): Promise<PatientDrugSafety> {
    const row = await this.prisma.patientDrugSafety.findFirst({
      where: { id: entryId, patientId },
    });
    if (!row) throw new NotFoundException('Entry not found');
    return row;
  }

  /** The owner's practice changes any entry; another practice only its own. */
  private mayChange(
    row: PatientDrugSafety,
    doctorId: string,
    ownerDoctorId: string | null,
  ): boolean {
    return ownerDoctorId === doctorId || row.practiceDoctorId === doctorId;
  }

  private assertMayChange(
    row: PatientDrugSafety,
    doctorId: string,
    ownerDoctorId: string | null,
  ): void {
    if (!this.mayChange(row, doctorId, ownerDoctorId)) {
      throw new ForbiddenException(
        "Another practice added this entry; only that practice or the patient's own doctor can change it.",
      );
    }
  }

  private view(
    r: PatientDrugSafety,
    doctorId: string,
    ownerDoctorId: string | null,
  ): DrugSafetyEntryView {
    return {
      id: r.id,
      kind: r.kind === 'text' ? 'text' : 'drug',
      brand: r.brand,
      generic: r.generic,
      hypersensitive: r.hypersensitive,
      highAlert: r.highAlert,
      text: r.text,
      createdByName: r.createdByName,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      editable: this.mayChange(r, doctorId, ownerDoctorId),
    };
  }

  /**
   * The acting practice's feed (the workstation doctor, never resolved again).
   * Never allowed to fail the request: the entry is already written.
   */
  private async logActivity(
    doctorId: string,
    actor: Actor,
    patient: { id: string; name: string },
    action: 'added' | 'saved',
    detail: string,
  ): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: {
          doctorId,
          actorName: actor.name || 'Someone',
          section: SECTION,
          detail: detail.slice(0, 400),
          patientName: (patient.name ?? '').slice(0, 200) || null,
          patientId: patient.id,
          action,
        },
      });
    } catch (e) {
      this.log.warn(`activity line not written: ${String(e)}`);
    }
  }
}
