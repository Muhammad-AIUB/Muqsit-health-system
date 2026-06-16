import { Injectable } from '@nestjs/common';
import { ActivityLog } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityDto } from './dto/activity.dto';

@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  // The "practice" a user belongs to: a doctor is their own practice; an
  // assistant belongs to the doctor they assist. So a doctor and all their
  // assistants share one activity feed.
  private async practiceDoctorId(userId: string): Promise<string> {
    const link = await this.prisma.assistant.findFirst({
      where: { assistantId: userId, status: 'active' },
      select: { doctorId: true },
      orderBy: { createdAt: 'asc' },
    });
    return link?.doctorId ?? userId;
  }

  async create(userId: string, actorName: string, dto: CreateActivityDto): Promise<ActivityLog> {
    const doctorId = await this.practiceDoctorId(userId);
    return this.prisma.activityLog.create({
      data: {
        doctorId,
        actorName,
        section: dto.section,
        detail: dto.detail,
        patientName: dto.patientName ?? null,
        patientId: dto.patientId ?? null,
        action: dto.action ?? 'added',
      },
    });
  }

  // Most recent first, capped — the feed shows a rolling window, shared across
  // the whole practice (doctor + assistants).
  async list(userId: string, limit = 50): Promise<ActivityLog[]> {
    const doctorId = await this.practiceDoctorId(userId);
    return this.prisma.activityLog.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
