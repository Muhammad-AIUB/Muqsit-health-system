import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';

// Public-safe shape of a registration (no password hash).
export type Registration = Omit<User, 'passwordHash'>;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly users: UsersService,
    private readonly mail: MailService,
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
}
