import { Module } from '@nestjs/common';
import { DrugAdviceController } from './drug-advice.controller';
import { DrugAdviceService } from './drug-advice.service';
import { WorkstationsModule } from '../workstations/workstations.module';

// WorkstationsModule is required: WorkstationGuard injects WorkstationsService
// and Nest resolves that at BOOT — typecheck is green without it and the API
// then crash-loops (server/CLAUDE.md, Rule 2c).
@Module({
  imports: [WorkstationsModule],
  controllers: [DrugAdviceController],
  providers: [DrugAdviceService],
})
export class DrugAdviceModule {}
