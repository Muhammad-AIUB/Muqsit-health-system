import { Module } from '@nestjs/common';
import { OpdController } from './opd.controller';
import { OpdService } from './opd.service';
import { WorkstationsModule } from '../workstations/workstations.module';
import { ChambersModule } from '../chambers/chambers.module';

@Module({
  imports: [WorkstationsModule, ChambersModule],
  controllers: [OpdController],
  providers: [OpdService],
  // The SMS to a day's queue (src/sms) reads the queue and its times through it.
  exports: [OpdService],
})
export class OpdModule {}
