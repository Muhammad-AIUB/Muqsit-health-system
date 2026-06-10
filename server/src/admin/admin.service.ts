import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';
import { UsersService } from '../users/users.service';

// Public-safe shape of a registration (no password hash).
export type Registration = Omit<User, 'passwordHash'>;

@Injectable()
export class AdminService {
  constructor(private readonly users: UsersService) {}

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
