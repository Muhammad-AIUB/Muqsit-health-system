import { BadRequestException } from '@nestjs/common';
import type { ChambersService } from '../chambers/chambers.service';
import type { ChamberScope } from './statistics.service';

// ⚕️ `chamber` is a claim, decided where every chamber is decided: absent, empty
// or `all` is every chamber of the practice ("All chamber total"); anything else
// goes through `ChambersService.resolve` — the default chamber's own id is the
// default chamber, another live chamber of THIS practice is that one, and
// another practice's, a removed one or a made-up id is 404, never a quiet
// fall-back to the total.
//
// ONE copy for both readers of the numbers — the doctor's own Statistics page
// (`StatisticsController`) and the admin's view of a doctor's
// (`AdminDoctorService`) — so that the two can never read a chamber differently.
export async function resolveChamberScope(
  chambers: Pick<ChambersService, 'resolve'>,
  doctorId: string,
  raw: unknown,
): Promise<ChamberScope> {
  if (raw === undefined || raw === '' || raw === 'all') return { kind: 'all' };
  if (typeof raw !== 'string') throw new BadRequestException('Choose one chamber, or all.');
  return { kind: 'one', chamberId: await chambers.resolve(doctorId, raw) };
}
