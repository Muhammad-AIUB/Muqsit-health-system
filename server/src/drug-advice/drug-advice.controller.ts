import { Body, Controller, ForbiddenException, Get, Put, UseGuards } from '@nestjs/common';
import { DrugAdviceService } from './drug-advice.service';
import { SaveDrugAdviceDto } from './dto/drug-advice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { ActiveWorkstation, WorkstationDoctorId } from '../workstations/workstation.decorator';
import type { Workstation } from '../workstations/workstations.service';

/**
 * Special advice per medicine / per generic (℞ pad •••).
 *
 * ⚕️ Scope is the WORKSTATION DOCTOR: an assistant reads and writes the advice
 * of the doctor they assist (the prescription carries that doctor's name); a
 * supervising doctor works in their own workstation and sees their own. No
 * doctor ever sees another's.
 */
@Controller('drug-advice')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class DrugAdviceController {
  constructor(private readonly advice: DrugAdviceService) {}

  // GET /api/drug-advice
  @Get()
  list(@WorkstationDoctorId() doctorId: string) {
    return this.advice.list(doctorId);
  }

  // PUT /api/drug-advice  { scope, label, lines }
  // An assistant writes the doctor's standing advice only with the same key
  // that lets them edit the Advice section ("rx.advice").
  @Put()
  save(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @Body() dto: SaveDrugAdviceDto,
  ) {
    if (ws.role === 'assistant' && !ws.permissions.includes('rx.advice')) {
      throw new ForbiddenException('You do not have permission to edit advice');
    }
    return this.advice.save(doctorId, dto);
  }
}
