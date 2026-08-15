import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddTeamMemberDto,
  CreateWardDto,
  UpdateTeamMemberDto,
  UpdateWardDto,
} from './dto/ward.dto';

// ⚕️ IPD wards and their teams ("new correction 2.docx" #2).
//
// A ward belongs to ONE doctor's practice. Every admission on that ward is
// under the ward's team, and each member carries their own permission keys.
//
// Every method here is keyed on the signed-in doctor's OWN id — deliberately
// not the workstation doctor. Managing who may reach admitted patients is an
// owner-only act, exactly like managing assistants: an assistant working
// inside the practice must never be able to add themselves, or anyone else,
// to a ward team.

export interface TeamMemberView {
  id: string;
  userId: string;
  name: string;
  email: string;
  mobile: string | null;
  profession: string | null;
  accountTier: string;
  status: string;
  permissions: string[];
}

export interface WardView {
  id: string;
  name: string;
  members: TeamMemberView[];
  /** Admissions currently linked to this ward — shown so the doctor can see
   *  what a rename or delete affects before doing it. */
  admissionCount: number;
}

/** A registered user who can be put on a ward team (search result). */
export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  profession: string | null;
  accountTier: string;
}

interface MemberRow {
  id: string;
  userId: string;
  status: string;
  permissions: string[];
  user: {
    name: string;
    email: string;
    mobile: string | null;
    profession: string | null;
    accountTier: string;
  };
}

@Injectable()
export class WardsService {
  constructor(private readonly prisma: PrismaService) {}

  private static memberView(row: MemberRow): TeamMemberView {
    return {
      id: row.id,
      userId: row.userId,
      name: row.user.name,
      email: row.user.email,
      mobile: row.user.mobile,
      profession: row.user.profession,
      accountTier: row.user.accountTier,
      status: row.status,
      permissions: row.permissions,
    };
  }

  private static readonly memberInclude = {
    members: {
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            mobile: true,
            profession: true,
            accountTier: true,
          },
        },
      },
    },
    _count: { select: { admissions: true } },
  } as const;

  private static view(row: {
    id: string;
    name: string;
    members: MemberRow[];
    _count: { admissions: number };
  }): WardView {
    return {
      id: row.id,
      name: row.name,
      members: row.members.map((m) => WardsService.memberView(m)),
      admissionCount: row._count.admissions,
    };
  }

  async list(doctorId: string): Promise<WardView[]> {
    const rows = await this.prisma.ward.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'asc' },
      include: WardsService.memberInclude,
    });
    return rows.map((r) => WardsService.view(r));
  }

  async create(doctorId: string, dto: CreateWardDto): Promise<WardView> {
    await this.ensureNameFree(doctorId, dto.name);
    const row = await this.prisma.ward.create({
      data: { doctorId, name: dto.name },
      include: WardsService.memberInclude,
    });
    return WardsService.view(row);
  }

  /**
   * Rename a ward. The name is also what admissions display, so every
   * admission linked to this ward is re-stamped in the same transaction —
   * otherwise the ward list and the bed cards would disagree about where a
   * patient is. Admissions that only carry the old name as free text are NOT
   * touched: they were never linked, and rewriting them would move a patient
   * between wards on a guess.
   */
  async rename(doctorId: string, id: string, dto: UpdateWardDto): Promise<WardView> {
    const ward = await this.ensureOwned(doctorId, id);
    if (ward.name === dto.name) return this.get(doctorId, id);
    await this.ensureNameFree(doctorId, dto.name);

    await this.prisma.$transaction([
      this.prisma.ward.update({ where: { id }, data: { name: dto.name } }),
      this.prisma.ipdAdmission.updateMany({ where: { wardId: id }, data: { wardNo: dto.name } }),
    ]);
    return this.get(doctorId, id);
  }

  /**
   * Delete a ward and its team. Admissions are NOT deleted — the FK is
   * `SET NULL`, so an admitted patient keeps their record and their ward name
   * text, and simply stops being under a team. Losing a patient row because a
   * ward was reorganised would be unforgivable.
   */
  async remove(doctorId: string, id: string): Promise<{ id: string; unlinkedAdmissions: number }> {
    await this.ensureOwned(doctorId, id);
    const unlinkedAdmissions = await this.prisma.ipdAdmission.count({ where: { wardId: id } });
    await this.prisma.ward.delete({ where: { id } });
    return { id, unlinkedAdmissions };
  }

  /**
   * Registered users who can be put on a team, searched by email or mobile.
   * Only existing accounts surface — there is no manual add, same as
   * assistants. Soft-deleted accounts are excluded: an account in Trash must
   * not be handed access to admitted patients.
   */
  async search(doctorId: string, wardId: string, q?: string): Promise<DirectoryUser[]> {
    const term = q?.trim();
    if (!term) return [];
    await this.ensureOwned(doctorId, wardId);

    const existing = await this.prisma.ipdTeamMember.findMany({
      where: { wardId },
      select: { userId: true },
    });
    const excludeIds = [doctorId, ...existing.map((e) => e.userId)];

    return this.prisma.user.findMany({
      where: {
        role: 'professional',
        deletedAt: null,
        id: { notIn: excludeIds },
        OR: [
          { email: { contains: term, mode: 'insensitive' } },
          { mobile: { contains: term } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 10,
      select: {
        id: true, name: true, email: true, mobile: true,
        profession: true, accountTier: true,
      },
    });
  }

  async addMember(doctorId: string, wardId: string, dto: AddTeamMemberDto): Promise<WardView> {
    await this.ensureOwned(doctorId, wardId);
    if (dto.userId === doctorId) {
      throw new BadRequestException('You already have full access to your own ward.');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, role: 'professional', deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('No registered user found for that account.');

    const existing = await this.prisma.ipdTeamMember.findUnique({
      where: { wardId_userId: { wardId, userId: dto.userId } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('This user is already on the ward team.');

    await this.prisma.ipdTeamMember.create({
      data: {
        wardId,
        userId: dto.userId,
        permissions: [...new Set(dto.permissions ?? [])],
        status: 'active',
      },
    });
    return this.get(doctorId, wardId);
  }

  async updateMember(
    doctorId: string,
    wardId: string,
    memberId: string,
    dto: UpdateTeamMemberDto,
  ): Promise<WardView> {
    await this.ensureMember(doctorId, wardId, memberId);
    await this.prisma.ipdTeamMember.update({
      where: { id: memberId },
      data: {
        ...(dto.permissions !== undefined ? { permissions: { set: [...new Set(dto.permissions)] } } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    return this.get(doctorId, wardId);
  }

  async removeMember(doctorId: string, wardId: string, memberId: string): Promise<WardView> {
    await this.ensureMember(doctorId, wardId, memberId);
    await this.prisma.ipdTeamMember.delete({ where: { id: memberId } });
    return this.get(doctorId, wardId);
  }

  private async get(doctorId: string, id: string): Promise<WardView> {
    const row = await this.prisma.ward.findFirst({
      where: { id, doctorId },
      include: WardsService.memberInclude,
    });
    if (!row) throw new NotFoundException('Ward not found');
    return WardsService.view(row);
  }

  private async ensureOwned(doctorId: string, id: string): Promise<{ id: string; name: string }> {
    const row = await this.prisma.ward.findFirst({
      where: { id, doctorId },
      select: { id: true, name: true },
    });
    if (!row) throw new NotFoundException('Ward not found');
    return row;
  }

  private async ensureMember(doctorId: string, wardId: string, memberId: string): Promise<void> {
    await this.ensureOwned(doctorId, wardId);
    const row = await this.prisma.ipdTeamMember.findFirst({
      where: { id: memberId, wardId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Team member not found');
  }

  // Two wards called "Ward 3" in one practice would silently split a team, so
  // the clash is reported to the doctor instead of relying on the unique index
  // to surface as a 500.
  private async ensureNameFree(doctorId: string, name: string): Promise<void> {
    const clash = await this.prisma.ward.findFirst({
      where: { doctorId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`You already have a ward called "${name}".`);
  }
}
