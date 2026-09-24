import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MedicinesService } from './medicines.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CacheControl } from '../common/http/cache-control.interceptor';

@Controller('medicines')
@UseGuards(JwtAuthGuard)
export class MedicinesController {
  constructor(private readonly medicines: MedicinesService) {}

  // GET /medicines/search?q=napa
  //
  // The formulary is the same for every doctor and changes only by manual SQL,
  // so this is the one API route the browser may cache: `private` (it is behind
  // a login, never shared caches), one day, revalidated by the weak ETag
  // Express already emits. Every other route is `no-store` (main.ts).
  @Get('search')
  @CacheControl('private, max-age=86400')
  search(@Query('q') q?: string) {
    return this.medicines.search(q ?? '');
  }
}
