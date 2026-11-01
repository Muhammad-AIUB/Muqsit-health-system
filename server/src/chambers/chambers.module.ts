import { Module } from '@nestjs/common';
import { ChambersController } from './chambers.controller';
import { ChambersService } from './chambers.service';
import { WorkstationsModule } from '../workstations/workstations.module';

// WorkstationsModule: WorkstationGuard injects WorkstationsService, resolved at
// BOOT — without it the API crash-loops on start (server/CLAUDE.md).
@Module({
  imports: [WorkstationsModule],
  controllers: [ChambersController],
  providers: [ChambersService],
  exports: [ChambersService],
})
export class ChambersModule {}
