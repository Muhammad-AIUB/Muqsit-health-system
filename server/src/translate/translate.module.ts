import { Module } from '@nestjs/common';
import { TranslateController } from './translate.controller';
import { TranslateService } from './translate.service';
import { WorkstationsModule } from '../workstations/workstations.module';

// WorkstationsModule is required: WorkstationGuard injects WorkstationsService
// and Nest resolves that at BOOT (server/CLAUDE.md, Rule 2c).
@Module({
  imports: [WorkstationsModule],
  controllers: [TranslateController],
  providers: [TranslateService],
})
export class TranslateModule {}
