import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddAssistantDto, SetDefaultsDto, UpdateAssistantDto } from './dto/assistant.dto';

// Shape returned to the client — the link plus the assistant's public
// profile fields. Never exposes password hashes or unrelated user data.
export interface AssistantView {
  id: string;
  assistantId: string;
  name: string;
  email: string;
  mobile: string | null;
  profession: string | null;
  status: string;
  permissions: string[];
}

// A user who can be added as an assistant (search result).
export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  profession: string | null;
}

// Every query is scoped to the signed-in doctor — one doctor can never
// see or touch another doctor's assistant links.
@Injectable()
export class AssistantsService {
  constructor(private readonly prisma: PrismaService) {}

  private static view(row: {
    id: string;
    assistantId: string;
    status: string;
    permissions: string[];
    assistant: { name: string; email: string; mobile: string | null; profession: string | null };
  }): AssistantView {
    return {
      id: row.id,
      assistantId: row.assistantId,
      name: row.assistant.name,
      email: row.assistant.email,
      mobile: row.assistant.mobile,
      profession: row.assistant.profession,
      status: row.status,
      permissions: row.permissions,
    };
  }

  async list(doctorId: string): Promise<AssistantView[]> {
    const rows = await this.prisma.assistant.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'asc' },
      include: {
        assistant: { select: { name: true, email: true, mobile: true, profession: true } },
      },
    });
    return rows.map((r) => AssistantsService.view(r));
  }

  // Search registered users by email or mobile to add as an assistant.
  // Excludes the doctor themselves and anyone already linked. "No manual
  // add" — only existing accounts surface here.
  async search(doctorId: string, q?: string): Promise<DirectoryUser[]> {
    const term = q?.trim();
    if (!term) return [];

    const existing = await this.prisma.assistant.findMany({
      where: { doctorId },
      select: { assistantId: true },
    });
    const excludeIds = [doctorId, ...existing.map((e) => e.assistantId)];

    const users = await this.prisma.user.findMany({
      where: {
        role: 'professional',
        id: { notIn: excludeIds },
        OR: [
          { email: { contains: term, mode: 'insensitive' } },
          { mobile: { contains: term } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 10,
      select: { id: true, name: true, email: true, mobile: true, profession: true },
    });
    return users;
  }

  // The doctor's default permission set — applied to every new assistant and
  // used to pre-fill the editor.
  async getDefaults(doctorId: string): Promise<{ permissions: string[] }> {
    const doctor = await this.prisma.user.findUnique({
      where: { id: doctorId },
      select: { assistantDefaultPermissions: true },
    });
    return { permissions: doctor?.assistantDefaultPermissions ?? [] };
  }

  // Saving defaults propagates the change to every existing assistant as a
  // delta: a newly-ticked permission is granted to all of them, a newly-
  // unticked one is revoked from all of them. Permissions that aren't part of
  // the change are left untouched, so per-assistant custom grants survive.
  async setDefaults(
    doctorId: string,
    dto: SetDefaultsDto,
  ): Promise<{ permissions: string[]; updatedAssistants: number }> {
    const { permissions: oldPerms } = await this.getDefaults(doctorId);
    const newPerms = [...new Set(dto.permissions)];
    const oldSet = new Set(oldPerms);
    const newSet = new Set(newPerms);
    const added = newPerms.filter((p) => !oldSet.has(p));
    const removed = oldPerms.filter((p) => !newSet.has(p));

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: doctorId },
        data: { assistantDefaultPermissions: { set: newPerms } },
        select: { assistantDefaultPermissions: true },
      });

      let updatedAssistants = 0;
      if (added.length || removed.length) {
        const links = await tx.assistant.findMany({
          where: { doctorId },
          select: { id: true, permissions: true },
        });
        for (const link of links) {
          const set = new Set(link.permissions);
          added.forEach((p) => set.add(p));
          removed.forEach((p) => set.delete(p));
          // Only write when the set actually changed.
          if (set.size !== link.permissions.length || link.permissions.some((p) => !set.has(p))) {
            await tx.assistant.update({ where: { id: link.id }, data: { permissions: { set: [...set] } } });
            updatedAssistants += 1;
          }
        }
      }

      return { permissions: updated.assistantDefaultPermissions, updatedAssistants };
    });
  }

  async add(doctorId: string, dto: AddAssistantDto): Promise<AssistantView> {
    const { assistantId } = dto;
    if (assistantId === doctorId) {
      throw new BadRequestException('You cannot add yourself as an assistant.');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: assistantId, role: 'professional' },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('No registered user found for that account.');

    const existing = await this.prisma.assistant.findUnique({
      where: { doctorId_assistantId: { doctorId, assistantId } },
    });
    if (existing) throw new ConflictException('This user is already your assistant.');

    // New assistants inherit the doctor's current default permission set.
    const { permissions } = await this.getDefaults(doctorId);

    const row = await this.prisma.assistant.create({
      data: { doctorId, assistantId, permissions, status: 'active' },
      include: {
        assistant: { select: { name: true, email: true, mobile: true, profession: true } },
      },
    });
    return AssistantsService.view(row);
  }

  async update(doctorId: string, id: string, dto: UpdateAssistantDto): Promise<AssistantView> {
    await this.ensureOwned(doctorId, id);
    const data: Prisma.AssistantUpdateInput = {};
    if (dto.permissions !== undefined) data.permissions = { set: dto.permissions };
    if (dto.status !== undefined) data.status = dto.status;

    const row = await this.prisma.assistant.update({
      where: { id },
      data,
      include: {
        assistant: { select: { name: true, email: true, mobile: true, profession: true } },
      },
    });
    return AssistantsService.view(row);
  }

  async remove(doctorId: string, id: string): Promise<{ id: string }> {
    await this.ensureOwned(doctorId, id);
    await this.prisma.assistant.delete({ where: { id } });
    return { id };
  }

  private async ensureOwned(doctorId: string, id: string): Promise<void> {
    const row = await this.prisma.assistant.findFirst({ where: { id, doctorId }, select: { id: true } });
    if (!row) throw new NotFoundException('Assistant not found');
  }
}
