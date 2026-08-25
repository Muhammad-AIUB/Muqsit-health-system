import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { IpdAdmission, IpdEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  AddAnalogueSheetsDto,
  CreateAdmissionDto,
  CreateIpdEventDto,
  UpdateAdmissionDto,
  UpdateAdmissionStatusDto,
  UpdateAnalogueSheetDto,
} from './dto/ipd.dto';
import type { Workstation } from '../workstations/workstations.service';

// One photographed page of the ward's paper order sheet, as stored inside
// `IpdAdmission.clinical.analogueSheets`. Mirrors `IpdAnalogueSheet` in the
// client's `lib/api.ts`.
interface AnalogueSheet {
  id: string;
  url: string;
  thumbUrl?: string;
  addedAt: string;
  addedBy?: string;
  label?: string;
  removedAt?: string;
  removedBy?: string;
}

/** Who is acting — the signed-in user, not the workstation's doctor. */
export interface Actor {
  id: string;
  name: string;
  role?: string;
}

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

  /**
   * ⚕️ Carry the paper order-sheet pages across a whole-`clinical` write.
   *
   * `update()` replaces `clinical` wholesale, so a client that does not know
   * about `analogueSheets` erases every photographed page the moment the doctor
   * presses Save. That is not hypothetical: a deploy does not close the tabs
   * already open on a ward PC, and reverting the build that introduced the key
   * would turn every later save into a silent delete.
   *
   * The client guards the same seam from its side (`lib/ipdClinical.ts`). This
   * half exists because the client's guard only protects clients that have it.
   *
   * Deliberately narrow: only an ENTIRELY ABSENT key is carried forward. A
   * payload that sends `analogueSheets: []` is a client saying "none", and that
   * is allowed to win — the pages are never written through this route anyway
   * (see the /analogue routes), so absence is the only shape that means
   * "I wasn't told about this".
   */
  private preserveAnalogueSheets(
    stored: Prisma.JsonValue | null,
    incoming: Record<string, unknown>,
  ): Record<string, unknown> {
    if ('analogueSheets' in incoming) return incoming;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return incoming;
    const sheets = (stored as Record<string, unknown>).analogueSheets;
    if (sheets === undefined) return incoming;
    return { ...incoming, analogueSheets: sheets };
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
      if (dto.clinical !== undefined) {
        data.clinical = this.preserveAnalogueSheets(
          (admission as unknown as { clinical: Prisma.JsonValue | null }).clinical,
          dto.clinical,
        );
      }
      return tx.ipdAdmission.update({
        where: { id },
        data: data as Prisma.IpdAdmissionUpdateInput,
      });
    });
  }

  // ── Analogue (paper) order-sheet pages ────────────────────────────────────
  //
  // These are photographs of the ward's paper order sheet. They get their own
  // routes rather than riding the whole-`clinical` PATCH for two reasons, both
  // about not losing a page of a patient's orders:
  //
  //   1. The PATCH replaces `clinical` wholesale, so uploading through it would
  //      carry along whatever half-typed clinical fields happened to be in the
  //      doctor's editor at that moment.
  //   2. Every write here touches ONE entry (or appends). A whole-array write
  //      would simply relocate the clobber: two devices photographing the same
  //      sheet would overwrite each other's pages.
  //
  // Each operation also writes an `IpdEvent`, so the admission's own feed says
  // who added or removed a page and when.

  /**
   * Who may change the pages.
   *
   * Deliberately NOT "must hold `ipd.analogue`". The `ipd.*` keys are ticked per
   * IpdTeamMember and are kept out of the assistant editor on purpose
   * (`client/CLAUDE.md`): an assistant reaches IPD today with no key at all.
   * Requiring one here would take away something assistants can already do on
   * every other field of this same screen — a regression dressed as a guard.
   *
   * So: the doctor and their assistants act as they do everywhere else on this
   * screen, and any OTHER actor (the ward-team login, when it is built) needs
   * the key. The check is real the day that door opens, and denies nobody today.
   */
  private assertMayEditAnalogue(ws: Workstation): void {
    if (ws.role === 'owner' || ws.role === 'assistant') return;
    if (ws.permissions?.includes('ipd.analogue')) return;
    throw new ForbiddenException(
      'You do not have permission to change the analogue order sheet.',
    );
  }

  private readSheets(clinical: Prisma.JsonValue | null): AnalogueSheet[] {
    if (!clinical || typeof clinical !== 'object' || Array.isArray(clinical)) return [];
    const raw = (clinical as Record<string, unknown>).analogueSheets;
    // Json column: anything could be in there. Skip what cannot be read rather
    // than throwing on a doctor's upload.
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (s): s is AnalogueSheet =>
        !!s && typeof s === 'object' && typeof (s as AnalogueSheet).id === 'string',
    );
  }

  /**
   * Read → mutate the pages → write back, inside one transaction, re-reading the
   * admission under the lock so a concurrent upload is never overwritten. Every
   * other key of `clinical` is passed through untouched.
   */
  private async writeSheets(
    doctorId: string,
    id: string,
    ws: Workstation,
    actor: Actor,
    mutate: (sheets: AnalogueSheet[]) => { sheets: AnalogueSheet[]; note: string },
  ): Promise<IpdAdmission> {
    this.assertMayEditAnalogue(ws);
    return this.prisma.$transaction(async (tx) => {
      const admission = await tx.ipdAdmission.findFirst({ where: { id, doctorId } });
      if (!admission) throw new NotFoundException('Admission not found');

      const stored = (admission as unknown as { clinical: Prisma.JsonValue | null }).clinical;
      const { sheets, note } = mutate(this.readSheets(stored));

      const base =
        stored && typeof stored === 'object' && !Array.isArray(stored)
          ? (stored as Record<string, unknown>)
          : {};

      const updated = await tx.ipdAdmission.update({
        where: { id },
        data: {
          clinical: { ...base, analogueSheets: sheets },
        } as unknown as Prisma.IpdAdmissionUpdateInput,
      });

      // The audit line is part of the same transaction: a page that changed
      // hands without a record of who changed it is exactly what this feature
      // must not produce.
      await tx.ipdEvent.create({
        data: { admissionId: id, author: actor.name, role: actor.role ?? null, note },
      });

      return updated;
    });
  }

  async addAnalogueSheets(
    doctorId: string,
    id: string,
    ws: Workstation,
    actor: Actor,
    dto: AddAnalogueSheetsDto,
  ): Promise<IpdAdmission> {
    const now = new Date().toISOString();
    return this.writeSheets(doctorId, id, ws, actor, (sheets) => {
      const added: AnalogueSheet[] = dto.sheets.map((s) => ({
        id: randomUUID(),
        url: s.url,
        ...(s.thumbUrl ? { thumbUrl: s.thumbUrl } : {}),
        ...(s.label?.trim() ? { label: s.label.trim() } : {}),
        addedAt: now,
        addedBy: actor.id,
      }));
      const n = added.length;
      return {
        sheets: [...sheets, ...added],
        note: `Added ${n} order-sheet ${n === 1 ? 'page' : 'pages'}`,
      };
    });
  }

  async updateAnalogueSheet(
    doctorId: string,
    id: string,
    sheetId: string,
    ws: Workstation,
    actor: Actor,
    dto: UpdateAnalogueSheetDto,
  ): Promise<IpdAdmission> {
    return this.writeSheets(doctorId, id, ws, actor, (sheets) => {
      const target = sheets.find((s) => s.id === sheetId);
      if (!target) throw new NotFoundException('Order-sheet page not found');
      const label = dto.label.trim();
      return {
        sheets: sheets.map((s) => {
          if (s.id !== sheetId) return s;
          const next = { ...s };
          if (label) next.label = label;
          else delete next.label;
          return next;
        }),
        note: label
          ? `Labelled an order-sheet page "${label}"`
          : 'Cleared an order-sheet page label',
      };
    });
  }

  /**
   * SOFT delete. These are medico-legal documents: the entry keeps its place and
   * its data and simply stops being listed, so a page removed by mistake is
   * recoverable long after the Undo bar is gone, and the record says who removed
   * it. Nothing is deleted from disk.
   */
  async removeAnalogueSheet(
    doctorId: string,
    id: string,
    sheetId: string,
    ws: Workstation,
    actor: Actor,
  ): Promise<IpdAdmission> {
    const now = new Date().toISOString();
    return this.writeSheets(doctorId, id, ws, actor, (sheets) => {
      const target = sheets.find((s) => s.id === sheetId);
      if (!target) throw new NotFoundException('Order-sheet page not found');
      return {
        sheets: sheets.map((s) =>
          s.id === sheetId ? { ...s, removedAt: now, removedBy: actor.id } : s,
        ),
        note: `Removed an order-sheet page${target.label ? ` (${target.label})` : ''}`,
      };
    });
  }

  async restoreAnalogueSheet(
    doctorId: string,
    id: string,
    sheetId: string,
    ws: Workstation,
    actor: Actor,
  ): Promise<IpdAdmission> {
    return this.writeSheets(doctorId, id, ws, actor, (sheets) => {
      const target = sheets.find((s) => s.id === sheetId);
      if (!target) throw new NotFoundException('Order-sheet page not found');
      return {
        sheets: sheets.map((s) => {
          if (s.id !== sheetId) return s;
          const next = { ...s };
          delete next.removedAt;
          delete next.removedBy;
          return next;
        }),
        note: `Restored an order-sheet page${target.label ? ` (${target.label})` : ''}`,
      };
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
