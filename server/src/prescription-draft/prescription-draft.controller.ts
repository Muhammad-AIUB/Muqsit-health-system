import { Body, Controller, Delete, Get, Put, UseGuards } from '@nestjs/common';
import { PrescriptionDraftService } from './prescription-draft.service';
import { UpsertPrescriptionDraftDto } from './dto/prescription-draft.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('prescription-draft')
@UseGuards(JwtAuthGuard)
export class PrescriptionDraftController {
  constructor(private readonly drafts: PrescriptionDraftService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.drafts.get(user.id);
  }

  @Put()
  upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertPrescriptionDraftDto,
  ) {
    return this.drafts.upsert(user.id, dto);
  }

  @Delete()
  clear(@CurrentUser() user: AuthenticatedUser) {
    return this.drafts.clear(user.id);
  }
}
