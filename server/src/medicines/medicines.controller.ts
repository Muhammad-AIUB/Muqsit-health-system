import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { MedicinesService } from './medicines.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MedicinesByBrandDto } from './dto/by-brand.dto';

@Controller('medicines')
@UseGuards(JwtAuthGuard)
export class MedicinesController {
  constructor(private readonly medicines: MedicinesService) {}

  // GET /medicines/search?q=napa
  @Get('search')
  search(@Query('q') q?: string) {
    return this.medicines.search(q ?? '');
  }

  // POST /medicines/by-brand { words: ["napa", "sergel"] } — a read: the body
  // carries the words so that a whole pad is one request, not one per medicine.
  @Post('by-brand')
  @HttpCode(200)
  byBrand(@Body() dto: MedicinesByBrandDto) {
    return this.medicines.byBrand(dto.words);
  }
}
