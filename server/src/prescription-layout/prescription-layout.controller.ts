import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { PrescriptionLayoutService } from './prescription-layout.service';
import { UpsertPrescriptionLayoutDto } from './dto/prescription-layout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('prescription-layout')
@UseGuards(JwtAuthGuard)
export class PrescriptionLayoutController {
  constructor(private readonly layout: PrescriptionLayoutService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.layout.get(user.id);
  }

  @Put()
  upsert(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertPrescriptionLayoutDto) {
    return this.layout.upsert(user.id, dto);
  }
}
