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
import { AssistantsService } from './assistants.service';
import { AddAssistantDto, UpdateAssistantDto } from './dto/assistant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('assistants')
@UseGuards(JwtAuthGuard)
export class AssistantsController {
  constructor(private readonly assistants: AssistantsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.assistants.list(user.id);
  }

  @Get('search')
  search(@CurrentUser() user: AuthenticatedUser, @Query('q') q?: string) {
    return this.assistants.search(user.id, q);
  }

  @Post()
  add(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddAssistantDto) {
    return this.assistants.add(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAssistantDto,
  ) {
    return this.assistants.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.assistants.remove(user.id, id);
  }
}
