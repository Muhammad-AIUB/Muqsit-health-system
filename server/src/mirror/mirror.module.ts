import { Module } from '@nestjs/common';
import { MirrorController } from './mirror.controller';
import { MirrorService } from './mirror.service';

@Module({
  controllers: [MirrorController],
  providers: [MirrorService],
})
export class MirrorModule {}
