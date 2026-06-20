import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Workstation } from './workstations.service';

// The doctorId whose data this request operates on — the active workstation
// (set by WorkstationGuard), falling back to the user's own id. Use this in
// place of `user.id` for any per-doctor data scoping.
export const WorkstationDoctorId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{
      user?: { id?: string };
      workstationDoctorId?: string;
    }>();
    return req.workstationDoctorId ?? (req.user?.id as string);
  },
);

// The full active workstation (doctorId + role + granted permission keys) — used
// for permission checks.
export const ActiveWorkstation = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Workstation => {
    const req = ctx.switchToHttp().getRequest<{
      user?: { id?: string };
      workstation?: Workstation;
    }>();
    return (
      req.workstation ?? {
        doctorId: req.user?.id as string,
        name: '',
        role: 'owner',
        permissions: [],
      }
    );
  },
);
