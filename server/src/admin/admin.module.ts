import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { ChambersModule } from '../chambers/chambers.module';
import { StatisticsModule } from '../statistics/statistics.module';
import { AdminService } from './admin.service';
import { AdminDoctorService } from './admin-doctor.service';
import { AdminController } from './admin.controller';

// StatisticsModule / ChambersModule: the admin reads a doctor's numbers through
// the same service and chamber rule as the doctor's own page.
@Module({
  imports: [UsersModule, MailModule, AuthModule, ChambersModule, StatisticsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminDoctorService],
})
export class AdminModule {}
