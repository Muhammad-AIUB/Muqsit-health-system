import { Module } from '@nestjs/common';
import { OpdController } from './opd.controller';
import { OpdService } from './opd.service';
import { WorkstationsModule } from '../workstations/workstations.module';
import { ChambersModule } from '../chambers/chambers.module';

@Module({
  imports: [WorkstationsModule, ChambersModule],
  controllers: [OpdController],
  providers: [OpdService],
})
export class OpdModule {}
