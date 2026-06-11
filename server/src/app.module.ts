import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { UploadModule } from './uploads/upload.module';
import { AdminModule } from './admin/admin.module';
import { PatientsModule } from './patients/patients.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { OpdModule } from './opd/opd.module';
import { IpdModule } from './ipd/ipd.module';
import { ResearchModule } from './research/research.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    MailModule,
    AuthModule,
    UploadModule,
    AdminModule,
    PatientsModule,
    PrescriptionsModule,
    OpdModule,
    IpdModule,
    ResearchModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
