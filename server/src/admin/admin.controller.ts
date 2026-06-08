import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { RejectDto } from './dto/reject.dto';
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

  @Patch('registrations/:id/approve')
  approve(@Param('id') id: string) {
    return this.admin.approve(id);
  }

  @Patch('registrations/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.admin.reject(id, dto.reason);
  }
}
