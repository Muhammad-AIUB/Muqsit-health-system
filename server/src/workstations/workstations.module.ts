import { Module } from '@nestjs/common';
import { WorkstationsController } from './workstations.controller';
import { WorkstationsService } from './workstations.service';

@Module({
  controllers: [WorkstationsController],
  providers: [WorkstationsService],
  // Exported so other modules can resolve the active workstation for scoping.
  exports: [WorkstationsService],
})
export class WorkstationsModule {}
