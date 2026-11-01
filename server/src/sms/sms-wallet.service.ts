import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type LedgerReason = 'send' | 'refund' | 'topup' | 'adjust';

export const NOT_ENOUGH_BALANCE = 'Not enough SMS balance.';

// ⚕️ The practice's SMS wallet. Rules that are safety, not style:
// - `doctorId` is the PRACTICE doctor, as `@WorkstationDoctorId()` resolved it —
//   an assistant spends and sees the practice's wallet, never one of their own.
// - The balance changes only inside a transaction that holds the wallet's row
//   lock (`lock`), and every change writes ONE ledger row beside it, so the
//   ledger always adds up to the balance.
// - It is never below 0: a debit that would take it there is refused before
//   anything is written (and `manual-sms-wallet.sql` adds a CHECK as well).
// Callers run these with `ROW_LOCK_TX` (src/prisma/row-lock.ts).
@Injectable()
export class SmsWalletService {
  constructor(private readonly prisma: PrismaService) {}

  async balance(doctorId: string): Promise<number> {
    const w = await this.prisma.smsWallet.findUnique({
      where: { doctorId },
      select: { balance: true },
    });
    return w?.balance ?? 0;
  }

  ledger(doctorId: string, take = 50) {
    return this.prisma.smsLedger.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        delta: true,
        reason: true,
        ref: true,
        note: true,
        createdAt: true,
      },
    });
  }

  /** The wallet's balance under its row lock, made if it does not exist yet. */
  async lock(tx: Prisma.TransactionClient, doctorId: string): Promise<number> {
    await tx.$executeRaw`
      INSERT INTO "SmsWallet" ("id", "doctorId", "balance", "updatedAt")
      VALUES (${randomUUID()}, ${doctorId}, 0, NOW())
      ON CONFLICT ("doctorId") DO NOTHING`;
    const rows = await tx.$queryRaw<{ balance: number }[]>`
      SELECT "balance" FROM "SmsWallet" WHERE "doctorId" = ${doctorId} FOR UPDATE`;
    return rows[0].balance;
  }

  /**
   * Change the balance by `delta` and write its ledger row. Takes the lock
   * itself (taking it twice in one transaction is fine). Refuses a change that
   * would leave the balance below 0, before writing anything.
   */
  async apply(
    tx: Prisma.TransactionClient,
    doctorId: string,
    delta: number,
    entry: {
      reason: LedgerReason;
      ref?: string | null;
      note?: string | null;
      createdById?: string | null;
    },
  ): Promise<number> {
    if (!Number.isInteger(delta))
      throw new BadRequestException('An SMS balance changes by whole taka.');
    const before = await this.lock(tx, doctorId);
    const after = before + delta;
    if (after < 0)
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: NOT_ENOUGH_BALANCE,
        code: 'SMS_BALANCE',
      });
    await tx.smsWallet.update({
      where: { doctorId },
      data: { balance: after },
    });
    await tx.smsLedger.create({
      data: {
        doctorId,
        delta,
        reason: entry.reason,
        ref: entry.ref ?? null,
        note: entry.note ?? null,
        createdById: entry.createdById ?? null,
      },
    });
    return after;
  }
}
