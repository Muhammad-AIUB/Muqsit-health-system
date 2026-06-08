import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [UsersModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
