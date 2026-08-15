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
import { WardsService } from './wards.service';
import {
  AddTeamMemberDto,
  CreateWardDto,
  UpdateTeamMemberDto,
  UpdateWardDto,
} from './dto/ward.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';

// ⚕️ Owner-only by construction: every handler passes the signed-in user's OWN
// id, never a workstation doctor id. Deciding who may reach admitted patients
// is the practice owner's call — an assistant working inside the practice must
// not be able to put anyone on a ward team, including themselves. Same posture
// as AssistantsController.
@Controller('wards')
@UseGuards(JwtAuthGuard)
export class WardsController {
  constructor(private readonly wards: WardsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.wards.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWardDto) {
    return this.wards.create(user.id, dto);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWardDto,
  ) {
    return this.wards.rename(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.wards.remove(user.id, id);
  }

  @Get(':id/search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('q') q?: string,
  ) {
    return this.wards.search(user.id, id, q);
  }

  @Post(':id/members')
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddTeamMemberDto,
  ) {
    return this.wards.addMember(user.id, id, dto);
  }

  @Patch(':id/members/:memberId')
  updateMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.wards.updateMember(user.id, id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
  ) {
    return this.wards.removeMember(user.id, id, memberId);
  }
}
