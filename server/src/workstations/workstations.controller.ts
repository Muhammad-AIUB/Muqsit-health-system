import { Controller, Get, UseGuards } from '@nestjs/common';
import { WorkstationsService } from './workstations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('workstations')
@UseGuards(JwtAuthGuard)
export class WorkstationsController {
  constructor(private readonly workstations: WorkstationsService) {}

  // Every practice the signed-in user can work in (own + assisted).
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.workstations.listForUser(user.id);
  }
}
