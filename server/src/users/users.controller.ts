import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Full profile of the signed-in user. /auth/me returns only the four
  // fields needed by the auth context; this one returns everything the
  // profile form needs (certs, NID, chambers, etc.).
  @Get('me')
  async me(@CurrentUser() current: AuthenticatedUser) {
    const profile = await this.users.getProfile(current.id);
    if (!profile) throw new NotFoundException();
    return profile;
  }

  @Patch('me')
  update(
    @CurrentUser() current: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(current.id, dto);
  }
}
