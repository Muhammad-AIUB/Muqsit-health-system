import { randomUUID } from 'crypto';
import {
  Body,
  Controller,
  Header,
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

  // X-Accel-Buffering disables nginx proxy buffering for this response so SSE
  // events flush to the browser immediately (without it, a buffering reverse
  // proxy holds the stream and real-time mirroring never arrives).
  @Sse('stream')
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache, no-transform')
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
