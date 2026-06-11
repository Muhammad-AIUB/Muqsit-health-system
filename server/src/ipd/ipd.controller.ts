import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IpdService } from './ipd.service';
import {
  CreateAdmissionDto,
  CreateIpdEventDto,
  UpdateAdmissionStatusDto,
} from './dto/ipd.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('ipd')
@UseGuards(JwtAuthGuard)
export class IpdController {
  constructor(private readonly ipd: IpdService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.ipd.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAdmissionDto) {
    return this.ipd.create(user.id, dto);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdmissionStatusDto,
  ) {
    return this.ipd.setStatus(user.id, id, dto);
  }

  @Get(':id/events')
  events(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ipd.listEvents(user.id, id);
  }

  @Post(':id/events')
  addEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateIpdEventDto,
  ) {
    return this.ipd.addEvent(user.id, id, user.name, dto);
  }
}
