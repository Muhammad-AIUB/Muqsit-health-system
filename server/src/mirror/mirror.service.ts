import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

// In-memory real-time fan-out for the "mirror my devices" feature. Each of a
// user's open browser tabs registers an SSE connection; an action on one is
// published to all the user's OTHER connections. Single-process only (one pm2
// instance) — which matches this deployment.
export type MirrorEvent = { data: string };

@Injectable()
export class MirrorService {
  private byUser = new Map<string, Map<string, Subject<MirrorEvent>>>();

  register(userId: string, connId: string): Subject<MirrorEvent> {
    const subject = new Subject<MirrorEvent>();
    let conns = this.byUser.get(userId);
    if (!conns) {
      conns = new Map();
      this.byUser.set(userId, conns);
    }
    conns.set(connId, subject);
    return subject;
  }

  unregister(userId: string, connId: string): void {
    const conns = this.byUser.get(userId);
    if (!conns) return;
    conns.get(connId)?.complete();
    conns.delete(connId);
    if (conns.size === 0) this.byUser.delete(userId);
  }

  // Fan out to every connection of this user EXCEPT the sender.
  publish(userId: string, senderConnId: string, type: string, payload: unknown): void {
    const conns = this.byUser.get(userId);
    if (!conns) return;
    const data = JSON.stringify({ type, payload });
    for (const [connId, subject] of conns) {
      if (connId === senderConnId) continue;
      subject.next({ data });
    }
  }
}
