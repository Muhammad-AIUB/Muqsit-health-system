import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertPrescriptionDraftDto } from './dto/prescription-draft.dto';

// Minimal view of the PrescriptionDraft delegate. Used via a loose cast so the
// module compiles and runs against the currently-generated Prisma client; once
// `prisma generate` picks up the new model the same calls are fully typed.
interface DraftDelegate {
  findUnique(args: { where: { userId: string } }): Promise<{ data: unknown } | null>;
  upsert(args: {
    where: { userId: string };
    create: { userId: string; data: Prisma.InputJsonValue };
    update: { data: Prisma.InputJsonValue };
  }): Promise<{ data: unknown }>;
  deleteMany(args: { where: { userId: string } }): Promise<{ count: number }>;
}

@Injectable()
export class PrescriptionDraftService {
  constructor(private readonly prisma: PrismaService) {}

  private get drafts(): DraftDelegate {
    return (this.prisma as unknown as { prescriptionDraft: DraftDelegate })
      .prescriptionDraft;
  }

  // Return the doctor's saved draft data, or an empty object if none yet.
  async get(userId: string): Promise<{ data: Record<string, unknown> }> {
    const row = await this.drafts.findUnique({ where: { userId } });
    return { data: (row?.data as Record<string, unknown>) ?? {} };
  }

  // Create on first save, overwrite thereafter — scoped to the signed-in doctor.
  async upsert(
    userId: string,
    dto: UpsertPrescriptionDraftDto,
  ): Promise<{ data: Record<string, unknown> }> {
    const data = dto.data as Prisma.InputJsonValue;
    const row = await this.drafts.upsert({
      where: { userId },
      create: { userId, data },
      update: { data },
    });
    return { data: (row.data as Record<string, unknown>) ?? {} };
  }

  // Discard the draft (after Save & print, or an explicit reset).
  async clear(userId: string): Promise<{ ok: true }> {
    await this.drafts.deleteMany({ where: { userId } });
    return { ok: true };
  }
}
