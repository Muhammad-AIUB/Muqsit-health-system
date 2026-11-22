import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId } from '../workstations/workstation.decorator';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { PatientAccessService } from './patient-access.service';

// Opening another practice's patient with the patient's own code (16/11/2026).
// The practice is the workstation's doctor (Rule 1), an assistant at the desk
// included — they ask for it at the front desk as they look a patient up by
// number. Tighter limits than the global 100/min: this is the one route that
// answers "is there a patient with this number?" to a doctor who is not theirs.
@Controller('patient-access')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class PatientAccessController {
  constructor(private readonly access: PatientAccessService) {}

  @Get('search')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  search(@WorkstationDoctorId() doctorId: string, @Query('mobile') mobile = '') {
    return this.access.search(doctorId, typeof mobile === 'string' ? mobile : '');
  }

  @Post(':patientId/code')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  requestCode(@WorkstationDoctorId() doctorId: string, @Param('patientId') patientId: string) {
    return this.access.requestCode(doctorId, patientId);
  }

  @Post(':patientId/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  verify(@WorkstationDoctorId() doctorId: string, @Param('patientId') patientId: string, @Body() dto: VerifyCodeDto) {
    return this.access.verify(doctorId, patientId, dto.code);
  }
}
