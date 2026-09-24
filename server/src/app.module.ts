import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheControlInterceptor } from './common/http/cache-control.interceptor';
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
import { WardsModule } from './wards/wards.module';
import { PrescriptionLayoutModule } from './prescription-layout/prescription-layout.module';
import { PrescriptionDraftModule } from './prescription-draft/prescription-draft.module';
import { TemplatesModule } from './templates/templates.module';
import { ActivityModule } from './activity/activity.module';
import { MedicinesModule } from './medicines/medicines.module';
import { RxHabitsModule } from './rx-habits/rx-habits.module';
import { DoctorPhrasesModule } from './doctor-phrases/doctor-phrases.module';
import { DrugAdviceModule } from './drug-advice/drug-advice.module';
import { PatientNotesModule } from './patient-notes/patient-notes.module';
import { WorkstationsModule } from './workstations/workstations.module';
import { PatientChatModule } from './patient-chat/patient-chat.module';
import { MirrorModule } from './mirror/mirror.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting on the API itself. The guard (AppThrottlerGuard, provided
    // as APP_GUARD from AuthModule because it verifies the JWT) counts
    // signed-in traffic per USER and anonymous traffic per IP — a clinic's
    // doctor + assistants share one address. Auth endpoints layer tighter
    // per-route limits on top (see @Throttle in AuthController).
    //
    // 300/min is a starting ceiling, not a clinical constant: a bulk upload of
    // 20 reports is ~80 requests (image + thumbnail + PATCH + activity line
    // each) plus the 8-second activity poll. Tune it from the 429 logs.
    //
    // `errorMessage` is what the doctor reads: the client shows body.message
    // verbatim, and the library default is "ThrottlerException: Too Many
    // Requests".
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      errorMessage:
        'Too many requests from this account or connection. Please wait a minute and try again.',
    }),
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
    WardsModule,
    PrescriptionLayoutModule,
    PrescriptionDraftModule,
    TemplatesModule,
    ActivityModule,
    MedicinesModule,
    RxHabitsModule,
    DoctorPhrasesModule,
    DrugAdviceModule,
    PatientNotesModule,
    WorkstationsModule,
    PatientChatModule,
    MirrorModule,
  ],
  controllers: [],
  // Explicit Cache-Control on routes that opt in (@CacheControl); everything
  // else is `no-store` from the middleware in main.ts.
  providers: [{ provide: APP_INTERCEPTOR, useClass: CacheControlInterceptor }],
})
export class AppModule {}
