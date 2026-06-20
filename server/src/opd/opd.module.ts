import { Module } from '@nestjs/common';
import { OpdController } from './opd.controller';
import { OpdService } from './opd.service';
import { WorkstationsModule } from '../workstations/workstations.module';

@Module({
  imports: [WorkstationsModule],
  controllers: [OpdController],
  providers: [OpdService],
})
export class OpdModule {}
