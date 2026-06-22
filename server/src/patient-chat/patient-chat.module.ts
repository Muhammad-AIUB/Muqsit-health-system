import { Module } from '@nestjs/common';
import {
  PatientChatController,
  SupervisedController,
} from './patient-chat.controller';
import { PatientChatService } from './patient-chat.service';
import { WorkstationsModule } from '../workstations/workstations.module';

@Module({
  imports: [WorkstationsModule],
  controllers: [PatientChatController, SupervisedController],
  providers: [PatientChatService],
})
export class PatientChatModule {}
