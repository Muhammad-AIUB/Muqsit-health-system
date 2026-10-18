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

/** The body's `code` for a page written for another user — the client tells it from a stale copy by this. */
const SIGNED_IN_USER_CHANGED = 'SIGNED_IN_USER_CHANGED';
const OTHER_USER =
  'Not saved: a different account has signed in on this browser since this page was opened, and these Revision Notes are not that account’s. What you typed is still on this screen — copy it, sign in again as yourself, then save.';
const OTHER_USER_READ =
  'A different account has signed in on this browser since this page was opened. Sign in again as yourself to open your Revision Notes.';
// A page from before `expectedUserId` (a tab keeps its build until a full
// reload). It shows a 409's sentence as written and keeps the typing, so: no
// code, and words that say what to do.
const OUTDATED_PAGE = 'This page is from before an update. Copy what you typed, reload the page, then paste it back.';

const otherUser = (message: string) =>
  new ConflictException({ statusCode: 409, error: 'Conflict', message, code: SIGNED_IN_USER_CHANGED });

/**
 * "Revision Notes" — the SIGNED-IN user's own notebook (physician's sheet,
 * 18/10/2026, item 4).
 *
 *  • `userId` is the authenticated user and the ONLY key: an assistant has a
 *    notebook of their own and never reads the doctor's.
 *  • A save is accepted only over the copy it was written from. The check and
 *    the write are ONE conditional statement (`update … where updatedAt`),
 *    so a save landing in between is refused too — never written over.
 *  • A save is accepted only for the user it was written for
 *    (`expectedUserId`). Two tabs share one login cookie: a tab still showing
 *    doctor 1 sent its autosave under doctor 2's session, and where doctor 2
 *    had no notebook yet, doctor 1's text became it (release review,
 *    18/10/2026). Checked before anything is read, here, not in the client.
 *    A save that names nobody comes from a page older than the check: refused
 *    too, with a sentence that old page shows as written.
 *  • A page that names its user is READ for that user only: coming back to
 *    the tab, doctor 1's page was answered with doctor 2's notebook and
 *    offered it in place of doctor 1's typing (release review of a2d7b93).
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

  /** GET: for a page that names its user, that user's notebook or nothing. A page that names nobody predates the check. */
  async read(userId: string, expectedUserId: string | string[] | undefined): Promise<RevisionNoteView | null> {
    if (expectedUserId !== undefined && expectedUserId !== userId) throw otherUser(OTHER_USER_READ);
    return this.get(userId);
  }

  async save(userId: string, dto: SaveRevisionNoteDto): Promise<RevisionNoteView> {
    if (dto.expectedUserId == null) throw new ConflictException(OUTDATED_PAGE);
    if (dto.expectedUserId !== userId) throw otherUser(OTHER_USER);
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
