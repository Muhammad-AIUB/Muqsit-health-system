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

  // Single registration with its uploaded extra certificates, for the
  // admin "View details" print page.
  async getOne(id: string) {
    const user = await this.users.findByIdWithDocs(id);
    if (!user || user.role !== 'professional') {
      throw new NotFoundException('Registration not found');
    }
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async approve(id: string): Promise<Registration> {
    const user = await this.users.findById(id);
    if (!user || user.role !== 'professional') {
      throw new NotFoundException('Registration not found');
    }
    const updated = await this.users.update(id, {
      approvalStatus: 'approved',
      rejectionReason: null,
      // Approving is restorative — pull it out of Trash if it was there.
      deletedAt: null,
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
      // Suspending from Trash restores it to its tier (suspended badge).
      deletedAt: null,
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
    // Moving an account to a tier is restorative — clear Trash if set.
    const updated = await this.users.update(id, { accountTier: tier, deletedAt: null });
    return this.strip(updated);
  }

  // Soft-delete → Trash. Recoverable via approve / move-tier. A trashed
  // account must not keep a live session, so revoke everything.
  async softDelete(id: string): Promise<Registration> {
    const user = await this.users.findById(id);
    if (!user || user.role !== 'professional') {
      throw new NotFoundException('Registration not found');
    }
    const updated = await this.users.update(id, { deletedAt: new Date() });
    await this.auth.revokeAllForUser(id);
    return this.strip(updated);
  }

  // Permanent deletion from Trash — gone for good.
  async hardDelete(id: string): Promise<{ deleted: true }> {
    const user = await this.users.findById(id);
    if (!user || user.role !== 'professional') {
      throw new NotFoundException('Registration not found');
    }
    await this.auth.revokeAllForUser(id);
    await this.users.remove(id);
    return { deleted: true };
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
