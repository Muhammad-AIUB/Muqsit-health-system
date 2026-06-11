import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto } from './dto/prescription.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('prescriptions')
@UseGuards(JwtAuthGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptions.create(user.id, dto);
  }

  @Get()
  listByPatient(
    @CurrentUser() user: AuthenticatedUser,
    @Query('patientId') patientId: string,
  ) {
    return this.prescriptions.listByPatient(user.id, patientId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.prescriptions.get(user.id, id);
  }
}
