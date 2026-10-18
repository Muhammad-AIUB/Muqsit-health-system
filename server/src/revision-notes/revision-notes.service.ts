import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveRevisionNoteDto } from './dto/revision-note.dto';

export interface RevisionNoteView {
  html: string;
  updatedAt: Date;
}

// Worded for the doctor: `apiFetch` shows the server's message as it is.
const STALE =
  'Your Revision Notes were changed on another screen. Reload them to see that version before saving — what you typed here stays on this screen.';

/**
 * "Revision Notes" — the SIGNED-IN user's own notebook (physician's sheet,
 * 18/10/2026, item 4).
 *
 *  • `userId` is the authenticated user and the ONLY key: an assistant has a
 *    notebook of their own and never reads the doctor's.
 *  • A save is accepted only over the copy it was written from. The check and
 *    the write are ONE conditional statement (`update … where updatedAt`),
 *    so a save landing in between is refused too — never written over.
 */
@Injectable()
export class RevisionNotesService implements OnModuleInit {
  private readonly log = new Logger(RevisionNotesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1 FROM "DoctorRevisionNote" LIMIT 1`;
    } catch (e) {
      this.log.error(
        'DoctorRevisionNote is unreadable — Revision Notes are DEAD. Apply ' +
          `server/prisma/manual-revision-notes.sql through the tunnel. Cause: ${String(e)}`,
      );
    }
  }

  async get(userId: string): Promise<RevisionNoteView | null> {
    const row = await this.prisma.doctorRevisionNote.findUnique({
      where: { userId },
      select: { html: true, updatedAt: true },
    });
    return row ? { html: row.html, updatedAt: row.updatedAt } : null;
  }

  async save(userId: string, dto: SaveRevisionNoteDto): Promise<RevisionNoteView> {
    const stored = await this.get(userId);
    const base = dto.baseUpdatedAt ?? null;

    if (!stored) {
      if (base !== null) throw new ConflictException(STALE);
      try {
        const row = await this.prisma.doctorRevisionNote.create({
          data: { userId, html: dto.html },
          select: { html: true, updatedAt: true },
        });
        return { html: row.html, updatedAt: row.updatedAt };
      } catch (e) {
        // Two first saves at once: the second finds the first's row.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(STALE);
        throw e;
      }
    }

    if (base === null || new Date(base).getTime() !== stored.updatedAt.getTime()) throw new ConflictException(STALE);
    // ONE statement: written only while the stored copy is still that one, and
    // answered with the row it wrote — never a second read that another save
    // could land before (review, 18/10/2026).
    try {
      const row = await this.prisma.doctorRevisionNote.update({
        where: { userId, updatedAt: stored.updatedAt },
        data: { html: dto.html },
        select: { html: true, updatedAt: true },
      });
      return { html: row.html, updatedAt: row.updatedAt };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new ConflictException(STALE);
      throw e;
    }
  }
}
