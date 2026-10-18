import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { RevisionNotesService } from './revision-notes.service';
import { SaveRevisionNoteDto } from './dto/revision-note.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

/**
 * The signed-in user's own Revision Notes. Keyed by `@CurrentUser().id` and
 * nothing else: it holds no practice or patient data, so no workstation is
 * involved and no permission key — every user has their own, and nobody can
 * reach anyone else's.
 */
@Controller('revision-notes')
@UseGuards(JwtAuthGuard)
export class RevisionNotesController {
  constructor(private readonly notes: RevisionNotesService) {}

  // GET /api/revision-notes?expectedUserId= → { note } — the caller's own, or
  // null; 409 when the page names another user than the signed-in one.
  // Wrapped: a bare null is an empty 200 body, which the client cannot parse.
  @Get()
  async get(@CurrentUser() user: AuthenticatedUser, @Query('expectedUserId') expectedUserId?: string | string[]) {
    return { note: await this.notes.read(user.id, expectedUserId) };
  }

  // PUT /api/revision-notes { html, baseUpdatedAt, expectedUserId } → { html, updatedAt };
  // 409 when stale, when written for anyone but the signed-in user, or when it
  // names nobody (a page from before the check).
  @Put()
  save(@CurrentUser() user: AuthenticatedUser, @Body() dto: SaveRevisionNoteDto) {
    return this.notes.save(user.id, dto);
  }
}
