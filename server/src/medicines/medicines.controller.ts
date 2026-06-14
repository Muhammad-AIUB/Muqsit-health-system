import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MedicinesService } from './medicines.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('medicines')
@UseGuards(JwtAuthGuard)
export class MedicinesController {
  constructor(private readonly medicines: MedicinesService) {}

  // GET /medicines/search?q=napa
  @Get('search')
  search(@Query('q') q?: string) {
    return this.medicines.search(q ?? '');
  }
}
