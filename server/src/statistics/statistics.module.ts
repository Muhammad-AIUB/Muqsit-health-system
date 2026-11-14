import { Module } from '@nestjs/common';
import { ChambersModule } from '../chambers/chambers.module';
import { WorkstationsModule } from '../workstations/workstations.module';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

// WorkstationsModule: WorkstationGuard needs WorkstationsService in THIS module's
// injector (a controller here uses the guard — `npx tsc` is green without the
// import and the API then fails to boot). ChambersModule resolves the chamber
// the way the OPD queue does.
@Module({
  imports: [WorkstationsModule, ChambersModule],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
