import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ResearchService } from './research.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('research')
@UseGuards(JwtAuthGuard)
export class ResearchController {
  constructor(private readonly research: ResearchService) {}

  @Get('patients')
  search(@CurrentUser() user: AuthenticatedUser, @Query('q') q = '') {
    return this.research.search(user.id, q);
  }
}
