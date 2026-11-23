import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { TranslateService } from './translate.service';
import { TranslateAdviceDto } from './dto/translate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkstationGuard } from '../workstations/workstation.guard';

@Controller('translate')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class TranslateController {
  constructor(private readonly translate: TranslateService) {}

  // POST /api/translate/advice  { lines } → { lines: [{ source, bn }] }
  // A draft for the doctor to review; nothing is stored.
  @Post('advice')
  async advice(@Body() dto: TranslateAdviceDto) {
    return { lines: await this.translate.translateAdvice(dto.lines) };
  }
}
