import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
}
