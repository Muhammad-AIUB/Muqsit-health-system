import { Module } from '@nestjs/common';
import { PrescriptionLayoutController } from './prescription-layout.controller';
import { PrescriptionLayoutService } from './prescription-layout.service';

@Module({
  controllers: [PrescriptionLayoutController],
  providers: [PrescriptionLayoutService],
  exports: [PrescriptionLayoutService],
})
export class PrescriptionLayoutModule {}
