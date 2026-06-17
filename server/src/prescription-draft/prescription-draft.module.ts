import { Module } from '@nestjs/common';
import { PrescriptionDraftController } from './prescription-draft.controller';
import { PrescriptionDraftService } from './prescription-draft.service';

@Module({
  controllers: [PrescriptionDraftController],
  providers: [PrescriptionDraftService],
})
export class PrescriptionDraftModule {}
