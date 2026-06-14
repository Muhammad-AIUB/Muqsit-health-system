import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { AssistantsModule } from './assistants/assistants.module';
import { PrescriptionLayoutModule } from './prescription-layout/prescription-layout.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global baseline of 100 req/min/IP. Auth endpoints layer tighter
    // per-route limits on top of this (see @Throttle in AuthController).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
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
    AssistantsModule,
    PrescriptionLayoutModule,
  ],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
