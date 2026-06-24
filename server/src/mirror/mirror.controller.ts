import { randomUUID } from 'crypto';
import {
  Body,
  Controller,
  MessageEvent,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable, finalize, map, startWith } from 'rxjs';
import { MirrorService } from './mirror.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

// Real-time "mirror my devices" channel. A device opens the SSE stream and is
// handed a connId; whatever state it publishes is fanned out to the user's
// other devices. Scoped to the signed-in user — a user only ever mirrors their
// own sessions.
@Controller('mirror')
@UseGuards(JwtAuthGuard)
export class MirrorController {
  constructor(private readonly mirror: MirrorService) {}

  @Sse('stream')
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    const connId = randomUUID();
    const subject = this.mirror.register(user.id, connId);
    return subject.asObservable().pipe(
      // First event tells the client its own connId (so it can be excluded from
      // its own broadcasts).
      startWith({ data: JSON.stringify({ type: 'hello', payload: { connId } }) }),
      map((e) => ({ data: e.data }) as MessageEvent),
      finalize(() => this.mirror.unregister(user.id, connId)),
    );
  }

  @Post('publish')
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { connId: string; type: string; payload: unknown },
  ) {
    this.mirror.publish(user.id, body.connId, body.type, body.payload);
    return { ok: true };
  }
}
