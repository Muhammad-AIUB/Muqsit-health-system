import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OpdChamber, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ROW_LOCK_TX } from '../prisma/row-lock';
import { LAYOUT_DEFAULTS } from '../prescription-layout/prescription-layout.service';
import type { UpsertPrescriptionLayoutDto } from '../prescription-layout/dto/prescription-layout.dto';
import type { Workstation } from '../workstations/workstations.service';

export const DEFAULT_CHAMBER_NAME = 'Main chamber';
const NOT_FOUND = 'Chamber not found';
const OWNER_ONLY = 'Only the practice doctor can change chambers and their settings.';

// The layout fields a chamber may carry — the DTO's own, so nothing else
// stored on a PrescriptionLayout row (ids, userId, timestamps) is copied in.
const LAYOUT_KEYS = Object.keys(LAYOUT_DEFAULTS) as (keyof typeof LAYOUT_DEFAULTS)[];
const layoutOf = (src: Record<string, unknown>) =>
  Object.fromEntries(LAYOUT_KEYS.map((k) => [k, src[k] ?? LAYOUT_DEFAULTS[k]])) as typeof LAYOUT_DEFAULTS;

// ⚕️ Multiple chambers for OPD (physician's sheet 28/10/2026, item 8). A chamber
// belongs to the PRACTICE doctor (`@WorkstationDoctorId()`). The default chamber
// is the one every visit from before chambers belongs to; its visits and
// schedules are stored with `chamberId` NULL, so `resolve` answers NULL for it.
@Injectable()
export class ChambersService {
  constructor(private readonly prisma: PrismaService) {}

  private lock(tx: Prisma.TransactionClient, doctorId: string) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`chamber:${doctorId}`}))`;
  }

  // The practice's live chambers, the default first, then by when they were
  // added. The default is made on first read if there is none: named
  // DEFAULT_CHAMBER_NAME, with the address of the doctor's FIRST profile
  // chamber — copied once, never written over afterwards.
  async list(doctorId: string): Promise<OpdChamber[]> {
    const live = await this.prisma.opdChamber.findMany({
      where: { doctorId, removedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    if (live.some((c) => c.isDefault)) return live;
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, doctorId);
      const existing = await tx.opdChamber.findFirst({ where: { doctorId, isDefault: true } });
      if (existing) return;
      const profile = await tx.chamber.findFirst({ where: { userId: doctorId }, orderBy: { order: 'asc' } });
      await tx.opdChamber.create({
        data: { doctorId, name: DEFAULT_CHAMBER_NAME, address: profile?.address ?? '', isDefault: true },
      });
    }, ROW_LOCK_TX);
    return this.prisma.opdChamber.findMany({
      where: { doctorId, removedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  // ⚕️ The ONE place that decides which chamber a request acts on. The header
  // is a claim: absent → the default chamber (NULL); the default's own id →
  // NULL; another LIVE chamber of THIS practice → its id; anything else — a
  // chamber of another practice, a removed one, a made-up id — is 404, never a
  // quiet fall-back to the default (a patient booked into the wrong chamber's
  // list is a patient told the wrong place).
  async resolve(doctorId: string, header: string | undefined): Promise<string | null> {
    if (!header) return null;
    const c = await this.prisma.opdChamber.findFirst({ where: { id: header, doctorId, removedAt: null } });
    if (!c) throw new NotFoundException(NOT_FOUND);
    return c.isDefault ? null : c.id;
  }

  private assertOwner(ws: Workstation) {
    if (ws.role !== 'owner') throw new ForbiddenException(OWNER_ONLY);
  }

  private async own(doctorId: string, id: string): Promise<OpdChamber> {
    const c = await this.prisma.opdChamber.findFirst({ where: { id, doctorId, removedAt: null } });
    if (!c) throw new NotFoundException(NOT_FOUND);
    return c;
  }

  async create(doctorId: string, ws: Workstation, name: string, address?: string): Promise<OpdChamber> {
    this.assertOwner(ws);
    await this.list(doctorId); // the default exists before a second chamber does
    return this.prisma.opdChamber.create({
      data: { doctorId, name: name.trim(), address: (address ?? '').trim() },
    });
  }

  async update(doctorId: string, ws: Workstation, id: string, dto: { name?: string; address?: string }): Promise<OpdChamber> {
    this.assertOwner(ws);
    await this.own(doctorId, id);
    const data: Prisma.OpdChamberUpdateInput = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Give the chamber a name.');
      data.name = dto.name.trim();
    }
    if (dto.address !== undefined) data.address = dto.address.trim();
    return this.prisma.opdChamber.update({ where: { id }, data });
  }

  // Soft removal: the row stays (its visits still name it), it is no longer
  // listed or chosen. The default chamber holds every visit from before
  // chambers, and cannot be removed.
  async remove(doctorId: string, ws: Workstation, id: string): Promise<{ id: string }> {
    this.assertOwner(ws);
    const c = await this.own(doctorId, id);
    if (c.isDefault) throw new BadRequestException('The main chamber cannot be removed: it holds the OPD list from before chambers. Rename it instead.');
    await this.prisma.opdChamber.update({ where: { id }, data: { removedAt: new Date() } });
    return { id };
  }

  // A chamber's own print settings (OPD only): `null` when it has none, and the
  // doctor's own settings print.
  async getLayout(doctorId: string, id: string): Promise<{ chamberId: string; layout: typeof LAYOUT_DEFAULTS | null }> {
    await this.own(doctorId, id);
    const row = await this.prisma.opdChamberLayout.findUnique({ where: { chamberId: id } });
    const stored = row?.layout;
    return {
      chamberId: id,
      layout: stored && typeof stored === 'object' && !Array.isArray(stored) ? layoutOf(stored as Record<string, unknown>) : null,
    };
  }

  // Saved over the chamber's own settings — or, the first time, over the
  // practice doctor's current settings, so a chamber starts from what prints
  // today rather than from blank defaults.
  async saveLayout(doctorId: string, ws: Workstation, id: string, dto: UpsertPrescriptionLayoutDto) {
    this.assertOwner(ws);
    await this.own(doctorId, id);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, doctorId);
      const row = await tx.opdChamberLayout.findUnique({ where: { chamberId: id } });
      let base: Record<string, unknown>;
      if (row && row.layout && typeof row.layout === 'object' && !Array.isArray(row.layout)) {
        base = row.layout as Record<string, unknown>;
      } else {
        base = ((await tx.prescriptionLayout.findUnique({ where: { userId: doctorId } })) ?? {}) as Record<string, unknown>;
      }
      const defined = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
      const layout = layoutOf({ ...layoutOf(base), ...defined });
      await tx.opdChamberLayout.upsert({
        where: { chamberId: id },
        create: { chamberId: id, doctorId, layout: layout as Prisma.InputJsonValue },
        update: { layout: layout as Prisma.InputJsonValue },
      });
      return { chamberId: id, layout };
    }, ROW_LOCK_TX);
  }

  // Back to the doctor's own settings for this chamber. A settings row, not a
  // patient record: it is removed, and the doctor's settings print again.
  async clearLayout(doctorId: string, ws: Workstation, id: string) {
    this.assertOwner(ws);
    await this.own(doctorId, id);
    await this.prisma.opdChamberLayout.deleteMany({ where: { chamberId: id, doctorId } });
    return { chamberId: id, layout: null };
  }
}
