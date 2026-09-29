import * as bcrypt from 'bcryptjs';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

// Email verification after the case-insensitive email lookup (2026-09-29):
// - the OTP and the verified flag must land on the STORED row even when the
//   address was typed in a different case (an exact-match update verified 0
//   rows while still answering "Email verified");
// - an attempt is claimed ATOMICALLY before the compare, so parallel guesses
//   cannot all read attempts=0.

const make = async (opts: { claimCount: number }) => {
  const codeHash = await bcrypt.hash('123456', 4);
  const record = { id: 'otp1', email: 'Dr.Rahim@gmail.com', codeHash, attempts: 0, expiresAt: new Date(Date.now() + 60_000) };
  const prisma = {
    emailOtp: {
      findFirst: jest.fn().mockResolvedValue(record),
      updateMany: jest.fn().mockResolvedValue({ count: opts.claimCount }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const users = {
    findByEmail: jest.fn().mockResolvedValue({ id: 'u1', email: 'Dr.Rahim@gmail.com' }),
    update: jest.fn().mockResolvedValue({}),
    setEmailVerified: jest.fn(),
  };
  const service = new AuthService(prisma as never, users as never, {} as never, {} as never, { get: () => undefined } as never);
  return { service, prisma, users };
};

describe('AuthService.verifyEmail', () => {
  it('looks the OTP up under the stored address and verifies that user by id', async () => {
    const { service, prisma, users } = await make({ claimCount: 1 });
    await service.verifyEmail('dr.rahim@gmail.com', '123456');
    expect(prisma.emailOtp.findFirst.mock.calls[0][0].where.email).toBe('Dr.Rahim@gmail.com');
    expect(users.update).toHaveBeenCalledWith('u1', { emailVerified: true });
    expect(users.setEmailVerified).not.toHaveBeenCalled();
  });

  it('claims the attempt atomically and refuses once none are left', async () => {
    const { service, prisma } = await make({ claimCount: 0 });
    await expect(service.verifyEmail('dr.rahim@gmail.com', '123456')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.emailOtp.updateMany.mock.calls[0][0].where).toEqual({ id: 'otp1', consumed: false, attempts: { lt: 5 } });
    expect(prisma.emailOtp.update).not.toHaveBeenCalled();
  });
});
