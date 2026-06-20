import { Module } from '@nestjs/common';
import { WorkstationsController } from './workstations.controller';
import { WorkstationsService } from './workstations.service';
import { WorkstationGuard } from './workstation.guard';

@Module({
  controllers: [WorkstationsController],
  providers: [WorkstationsService, WorkstationGuard],
  // Exported so other modules can resolve the active workstation + reuse the
  // guard for request scoping.
  exports: [WorkstationsService, WorkstationGuard],
})
export class WorkstationsModule {}
