import { Module } from '@nestjs/common';
import { RevisionNotesController } from './revision-notes.controller';
import { RevisionNotesService } from './revision-notes.service';

@Module({
  controllers: [RevisionNotesController],
  providers: [RevisionNotesService],
})
export class RevisionNotesModule {}
