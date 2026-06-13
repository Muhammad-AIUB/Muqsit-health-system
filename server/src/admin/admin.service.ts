import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { AuthService } from '../auth/auth.service';

// Public-safe shape of a registration (no password hash).
export type Registration = Omit<User, 'passwordHash'>;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly auth: AuthService,
  ) {}

  private strip(user: User): Registration {
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async listRegistrations(status?: string): Promise<Registration[]> {
    const users = await this.users.listByStatus(status);
    return users.map((u) => this.strip(u));
  }

  async approve(id: string): Promise<Registration> {
    const user = await this.users.findById(id);
    if (!user || user.role !== 'professional') {
      throw new NotFoundException('Registration not found');
    }
    const updated = await this.users.update(id, {
      approvalStatus: 'approved',
      rejectionReason: null,
    });

    // Fire-and-forget: tell the user their account is now active.
    void this.mail.sendAccountApproved(updated.email, updated.name).catch((e) => {
      this.logger.error(
        `Failed to send approval email to ${updated.email}: ${e?.message ?? e}`,
      );
    });

    return this.strip(updated);
  }

  async reject(id: string, reason: string): Promise<Registration> {
    const user = await this.users.findById(id);
    if (!user || user.role !== 'professional') {
      throw new NotFoundException('Registration not found');
    }
    const updated = await this.users.update(id, {
      approvalStatus: 'rejected',
      rejectionReason: reason,
    });
    // A rejected user is no longer allowed in — kill any live session.
    await this.auth.revokeAllForUser(id);
    return this.strip(updated);
  }

  async suspend(id: string): Promise<Registration> {
    const user = await this.users.findById(id);
    if (!user || user.role !== 'professional') {
      throw new NotFoundException('Registration not found');
    }
    const updated = await this.users.update(id, {
      approvalStatus: 'suspended',
    });
    // Suspension should take effect immediately, not on next sign-in.
    await this.auth.revokeAllForUser(id);
    return this.strip(updated);
  }

  async setTier(id: string, tier: 'primary' | 'secondary'): Promise<Registration> {
    const user = await this.users.findById(id);
    if (!user || user.role !== 'professional') {
      throw new NotFoundException('Registration not found');
    }
    const updated = await this.users.update(id, { accountTier: tier });
    return this.strip(updated);
  }

  // Explicit "force logout" for cases that don't change approval state —
  // suspected device theft, leaked password being rotated, etc.
  async revokeSessions(id: string): Promise<{ revoked: number }> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    const revoked = await this.auth.revokeAllForUser(id);
    return { revoked };
  }
}
