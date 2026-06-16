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
import { AdminService } from './admin.service';
import { RejectDto } from './dto/reject.dto';
import { TierDto } from './dto/tier.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('registrations')
  list(@Query('status') status?: string) {
    return this.admin.listRegistrations(status);
  }

  @Get('registrations/:id')
  getOne(@Param('id') id: string) {
    return this.admin.getOne(id);
  }

  @Patch('registrations/:id/approve')
  approve(@Param('id') id: string) {
    return this.admin.approve(id);
  }

  @Patch('registrations/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.admin.reject(id, dto.reason);
  }

  @Patch('registrations/:id/suspend')
  suspend(@Param('id') id: string) {
    return this.admin.suspend(id);
  }

  @Patch('registrations/:id/tier')
  setTier(@Param('id') id: string, @Body() dto: TierDto) {
    return this.admin.setTier(id, dto.tier);
  }

  // Soft-delete → Trash (recoverable).
  @Delete('registrations/:id')
  softDelete(@Param('id') id: string) {
    return this.admin.softDelete(id);
  }

  // Permanent delete from Trash. More specific path than :id, declared
  // separately so it doesn't collide with the soft-delete route above.
  @Delete('registrations/:id/permanent')
  hardDelete(@Param('id') id: string) {
    return this.admin.hardDelete(id);
  }

  // Force-revoke every live session for a user (e.g. suspected device
  // theft). Returns the number of refresh tokens revoked.
  @Post('users/:id/revoke-sessions')
  revokeSessions(@Param('id') id: string) {
    return this.admin.revokeSessions(id);
  }
}
