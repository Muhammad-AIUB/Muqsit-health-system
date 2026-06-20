import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// A "workstation" is a practice a user can work inside: their OWN account
// (purchased tiers only) or any doctor they are an active assistant of. The
// active workstation decides whose data the user sees and which permissions
// apply.
export interface Workstation {
  doctorId: string;
  name: string;
  role: 'owner' | 'assistant';
  // Owner → [] (full access). Assistant → the keys the doctor granted them.
  permissions: string[];
}

@Injectable()
export class WorkstationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string): Promise<Workstation[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, displayName: true, accountTier: true },
    });
    if (!user) return [];

    const out: Workstation[] = [];

    // Own workstation — only for purchased tiers (primary/premium). A secondary
    // account can't work on its own, so it has no own workstation (→ shows the
    // upgrade gate instead).
    if (user.accountTier === 'primary' || user.accountTier === 'premium') {
      out.push({
        doctorId: user.id,
        name: user.displayName?.trim() || user.name,
        role: 'owner',
        permissions: [],
      });
    }

    // Practices this user assists (active links only), oldest first.
    const links = await this.prisma.assistant.findMany({
      where: { assistantId: userId, status: 'active' },
      select: {
        doctorId: true,
        permissions: true,
        doctor: { select: { name: true, displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    for (const l of links) {
      out.push({
        doctorId: l.doctorId,
        name: l.doctor.displayName?.trim() || l.doctor.name,
        role: 'assistant',
        permissions: l.permissions,
      });
    }
    return out;
  }

  // Resolve the effective workstation for a request. `requested` is the
  // doctorId the client wants to act under (from the X-Workstation header).
  // Falls back to the user's own context when absent — so existing single-user
  // behaviour is unchanged until a workstation is explicitly chosen.
  async resolve(
    userId: string,
    requested?: string,
  ): Promise<Workstation> {
    if (!requested || requested === userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, displayName: true },
      });
      return {
        doctorId: userId,
        name: user?.displayName?.trim() || user?.name || 'My workspace',
        role: 'owner',
        permissions: [],
      };
    }

    const link = await this.prisma.assistant.findFirst({
      where: { assistantId: userId, doctorId: requested, status: 'active' },
      select: {
        permissions: true,
        doctor: { select: { name: true, displayName: true } },
      },
    });
    if (!link) {
      throw new ForbiddenException('You do not have access to this workstation');
    }
    return {
      doctorId: requested,
      name: link.doctor.displayName?.trim() || link.doctor.name,
      role: 'assistant',
      permissions: link.permissions,
    };
  }
}
