import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { WorkstationsService, type Workstation } from './workstations.service';

// Resolves the active workstation for a request from the `X-Workstation` header
// and attaches it to the request. MUST run after JwtAuthGuard (so req.user is
// set) — list it second: @UseGuards(JwtAuthGuard, WorkstationGuard).
//
// No header (or header === the user's own id) → the user's OWN context, so
// existing single-user behaviour is unchanged. A header naming a doctor the user
// actively assists → that doctor's context + the granted permissions. Any other
// value → 403 (handled inside WorkstationsService.resolve).
@Injectable()
export class WorkstationGuard implements CanActivate {
  constructor(private readonly workstations: WorkstationsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & {
      user?: { id?: string };
      workstation?: Workstation;
      workstationDoctorId?: string;
    }>();

    const userId = req.user?.id;
    if (!userId) return true; // auth is enforced by JwtAuthGuard; nothing to scope

    const raw = req.headers['x-workstation'];
    const requested = Array.isArray(raw) ? raw[0] : raw;

    if (!requested || requested === userId) {
      req.workstation = { doctorId: userId, name: 'My workspace', role: 'owner', permissions: [] };
      req.workstationDoctorId = userId;
      return true;
    }

    const ws = await this.workstations.resolve(userId, requested); // throws 403 if not allowed
    req.workstation = ws;
    req.workstationDoctorId = ws.doctorId;
    return true;
  }
}
