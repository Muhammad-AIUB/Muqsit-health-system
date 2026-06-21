import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import {
  CreatePatientDto,
  LinkPatientDto,
  UpdatePatientDto,
} from './dto/patient.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';
import { WorkstationDoctorId } from '../workstations/workstation.decorator';

// All patient data is scoped to the ACTIVE workstation's doctor (own account, or
// a doctor the user assists), not the raw logged-in user.
@Controller('patients')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  list(@WorkstationDoctorId() doctorId: string, @Query('search') search?: string) {
    return this.patients.list(doctorId, search);
  }

  @Get('watched')
  watched(@WorkstationDoctorId() doctorId: string) {
    return this.patients.listWatched(doctorId);
  }

  // Every patient on a given phone number (prescription mobile-lookup dropdown).
  // Declared before ':id' so the literal path isn't captured as an id.
  @Get('by-mobile')
  byMobile(@WorkstationDoctorId() doctorId: string, @Query('mobile') mobile = '') {
    return this.patients.findByMobile(doctorId, mobile);
  }

  // Create a new patient related to an existing one, with reciprocal family links.
  @Post('link')
  link(@WorkstationDoctorId() doctorId: string, @Body() dto: LinkPatientDto) {
    return this.patients.linkNew(doctorId, dto);
  }

  @Get(':id')
  get(@WorkstationDoctorId() doctorId: string, @Param('id') id: string) {
    return this.patients.get(doctorId, id);
  }

  @Post()
  create(@WorkstationDoctorId() doctorId: string, @Body() dto: CreatePatientDto) {
    return this.patients.create(doctorId, dto);
  }

  @Patch(':id')
  update(
    @WorkstationDoctorId() doctorId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
  ) {
    return this.patients.update(doctorId, id, dto);
  }

  @Delete(':id')
  remove(@WorkstationDoctorId() doctorId: string, @Param('id') id: string) {
    return this.patients.remove(doctorId, id);
  }
}
