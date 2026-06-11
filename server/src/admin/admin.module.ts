import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [UsersModule, MailModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
