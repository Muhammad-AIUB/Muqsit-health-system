import { Module } from '@nestjs/common';
import { IpdController } from './ipd.controller';
import { IpdService } from './ipd.service';

@Module({
  controllers: [IpdController],
  providers: [IpdService],
})
export class IpdModule {}
