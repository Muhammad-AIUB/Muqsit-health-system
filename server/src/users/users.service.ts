import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // Look up by email address OR mobile number (for sign-in).
  findByEmailOrMobile(identifier: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { mobile: identifier }] },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  // Admin: list registrations, optionally filtered by approval status.
  listByStatus(status?: string): Promise<User[]> {
    return this.prisma.user.findMany({
      where: {
        role: 'professional',
        ...(status ? { approvalStatus: status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  setEmailVerified(email: string): Promise<Prisma.BatchPayload> {
    return this.prisma.user.updateMany({
      where: { email },
      data: { emailVerified: true },
    });
  }

  // ── Profile (self-service) ─────────────────────────────────
  // Returns the public projection of the signed-in user plus their
  // chambers, ready to bind to the profile form.
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        chambers: { orderBy: { order: 'asc' } },
        otherCertificates: { orderBy: { order: 'asc' } },
      },
    });
    if (!user) return null;
    const { passwordHash, ...rest } = user;
    return rest;
  }

  // Applies the editable fields and replaces the chamber list. Email and
  // mobile go through uniqueness checks because they're also identifiers
  // used to sign in.
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== userId) {
        throw new BadRequestException('That email is already in use');
      }
    }
    if (dto.mobile) {
      const existing = await this.prisma.user.findFirst({
        where: { mobile: dto.mobile },
      });
      if (existing && existing.id !== userId) {
        throw new BadRequestException('That mobile number is already in use');
      }
    }

    // Build the User update payload from the optional fields the client
    // chose to send. Untouched fields (undefined) are left alone; empty
    // string explicitly clears an image URL.
    // BMDC (registrationNo / registrationCertUrl) is deliberately not copied
    // here even if a hostile client tried to send it — those are admin-only.
    const data: Prisma.UserUpdateInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName || null;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.mobile !== undefined) data.mobile = dto.mobile;
    if (dto.nidNo !== undefined) data.nidNo = dto.nidNo;
    if (dto.designation !== undefined) data.designation = dto.designation;
    if (dto.specialty !== undefined) data.specialty = dto.specialty;
    if (dto.profilePictureUrl !== undefined) data.profilePictureUrl = dto.profilePictureUrl || null;
    if (dto.nidFrontUrl !== undefined) data.nidFrontUrl = dto.nidFrontUrl || null;
    if (dto.nidBackUrl !== undefined) data.nidBackUrl = dto.nidBackUrl || null;

    // Chambers and otherCertificates: replace the whole set in a transaction
    // so a half-saved state can't leave the user with phantom rows.
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data });

      if (dto.chambers !== undefined) {
        await tx.chamber.deleteMany({ where: { userId } });
        if (dto.chambers.length > 0) {
          await tx.chamber.createMany({
            data: dto.chambers.map((c, i) => ({
              userId,
              address: c.address,
              mapLink: c.mapLink ?? null,
              order: i,
            })),
          });
        }
      }

      if (dto.otherCertificates !== undefined) {
        await tx.otherCertificate.deleteMany({ where: { userId } });
        const valid = dto.otherCertificates.filter((c) => c.url);
        if (valid.length > 0) {
          await tx.otherCertificate.createMany({
            data: valid.map((c, i) => ({
              userId,
              url: c.url,
              details: c.details?.trim() || null,
              order: i,
            })),
          });
        }
      }
    });

    return this.getProfile(userId);
  }
}
