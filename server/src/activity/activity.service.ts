import { Injectable } from '@nestjs/common';
import { ActivityLog } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityDto } from './dto/activity.dto';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  // ⚕️ THE PRACTICE IS ALREADY RESOLVED — NEVER RESOLVE IT AGAIN HERE.
  //
  // Both methods take `doctorId` from the controller's `@WorkstationDoctorId()`,
  // which `WorkstationGuard` has already resolved from the `X-Workstation`
  // header (own id → own practice; a doctor the user actively assists → that
  // doctor). It is a DOCTOR id, not a user id.
  //
  // This class used to re-derive it with a `practiceDoctorId(userId)` helper
  // that looked up `Assistant where assistantId = <the value passed>`. For a
  // doctor who ALSO assists someone else — the dual role the workstation
  // switcher exists for — that second lookup silently redirected the feed to
  // the OTHER practice: they read that doctor's patient names and clinical
  // detail, and their own entries were filed under that doctor's id. Removed
  // 2026-08-27 (CSO audit finding 1). Do not reintroduce a lookup here; if the
  // scoping ever looks wrong, fix `WorkstationGuard`, which is the one place
  // that is allowed to decide whose practice a request acts on.

  async create(doctorId: string, actorName: string, dto: CreateActivityDto): Promise<ActivityLog> {
    return this.prisma.activityLog.create({
      data: {
        doctorId,
        actorName,
        section: dto.section,
        detail: dto.detail,
        patientName: dto.patientName ?? null,
        patientId: dto.patientId ?? null,
        action: dto.action ?? 'added',
        imageUrl: dto.imageUrl ?? null,
      },
    });
  }

  // Most recent first, cursor-paged — the feed shows a rolling window, shared
  // across the whole practice (doctor + assistants). When `patientId` is given,
  // it's scoped to that one patient's entries. `cursor` is the id of the last
  // row of the previous page; `id` is the ordering tiebreaker so two entries
  // logged in the same millisecond never straddle a page boundary twice.
  async list(
    doctorId: string,
    opts: { limit?: number; patientId?: string; cursor?: string } = {},
  ): Promise<{ items: ActivityLog[]; nextCursor: string | null }> {
    const take = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const rows = await this.prisma.activityLog.findMany({
      where: { doctorId, ...(opts.patientId ? { patientId: opts.patientId } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, take);
    const nextCursor = rows.length > take ? items[items.length - 1].id : null;
    return { items, nextCursor };
  }
}
