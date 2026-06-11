import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OpdService } from './opd.service';
import { CreateOpdVisitDto, UpdateOpdStatusDto } from './dto/opd.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('opd')
@UseGuards(JwtAuthGuard)
export class OpdController {
  constructor(private readonly opd: OpdService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.opd.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOpdVisitDto) {
    return this.opd.create(user.id, dto);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOpdStatusDto,
  ) {
    return this.opd.setStatus(user.id, id, dto);
  }
}
