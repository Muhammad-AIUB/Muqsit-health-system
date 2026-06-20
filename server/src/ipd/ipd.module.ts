import { Module } from '@nestjs/common';
import { IpdController } from './ipd.controller';
import { IpdService } from './ipd.service';
import { WorkstationsModule } from '../workstations/workstations.module';

@Module({
  imports: [WorkstationsModule],
  controllers: [IpdController],
  providers: [IpdService],
})
export class IpdModule {}
