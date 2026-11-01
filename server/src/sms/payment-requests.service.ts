import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ROW_LOCK_TX } from '../prisma/row-lock';
import {
  CreatePaymentRequestDto,
  CreditPaymentRequestDto,
  RejectPaymentRequestDto,
} from './dto/sms.dto';
import { SmsWalletService } from './sms-wallet.service';

const ALREADY_HANDLED = 'This request has been handled already.';

// Settings → Payment: "Renew" and "Buy SMS" (physician's sheet, 28/10/2026).
// Renew is a renewal of the doctor's MONTHLY subscription (physician,
// 01/11/2026); no fee was given, so the doctor types the months and the amount.
// No payment gateway was named and none is built: a request is a note to the
// admin, who credits the wallet after the payment has come in. Nothing here
// sets a price or a package — the doctor types the number and the amount.
@Injectable()
export class PaymentRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: SmsWalletService,
  ) {}

  create(doctorId: string, userId: string, dto: CreatePaymentRequestDto) {
    if (dto.kind === 'sms' && !dto.quantity)
      throw new BadRequestException('Enter how many SMS you want to buy.');
    return this.prisma.paymentRequest.create({
      data: {
        doctorId,
        kind: dto.kind,
        // sms: SMS to buy; renew: months of the monthly subscription.
        quantity: dto.quantity ?? null,
        amount: dto.amount ?? null,
        note: dto.note?.trim() || null,
        createdById: userId,
      },
    });
  }

  mine(doctorId: string) {
    return this.prisma.paymentRequest.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // ── admin ──────────────────────────────────────────────────────────────────
  async list(status?: string) {
    const where: Prisma.PaymentRequestWhereInput = status ? { status } : {};
    const rows = await this.prisma.paymentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const ids = [...new Set(rows.map((r) => r.doctorId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        displayName: true,
        email: true,
        mobile: true,
      },
    });
    const wallets = await this.prisma.smsWallet.findMany({
      where: { doctorId: { in: ids } },
      select: { doctorId: true, balance: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const bal = new Map(wallets.map((w) => [w.doctorId, w.balance]));
    return rows.map((r) => ({
      ...r,
      doctor: byId.get(r.doctorId) ?? null,
      balance: bal.get(r.doctorId) ?? 0,
    }));
  }

  // ⚕️ One transaction: the request is locked and must still be pending, the
  // wallet is credited with its ledger line, and the request marked — all or
  // nothing, so a request pressed twice credits once.
  async credit(id: string, adminId: string, dto: CreditPaymentRequestDto) {
    return this.prisma.$transaction(async (tx) => {
      const req = await this.lockRequest(tx, id);
      let credited: number | null = null;
      if (req.kind === 'sms') {
        credited = dto.credit ?? req.quantity ?? null;
        if (!credited)
          throw new BadRequestException('Enter how many SMS to credit.');
        await this.wallet.apply(tx, req.doctorId, credited, {
          reason: 'topup',
          ref: req.id,
          note: dto.note?.trim() || 'Payment request credited',
          createdById: adminId,
        });
      }
      return tx.paymentRequest.update({
        where: { id },
        data: {
          status: 'credited',
          credited,
          adminNote: dto.note?.trim() || null,
          handledAt: new Date(),
          handledById: adminId,
        },
      });
    }, ROW_LOCK_TX);
  }

  async reject(id: string, adminId: string, dto: RejectPaymentRequestDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockRequest(tx, id);
      return tx.paymentRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          adminNote: dto.note?.trim() || null,
          handledAt: new Date(),
          handledById: adminId,
        },
      });
    }, ROW_LOCK_TX);
  }

  private async lockRequest(tx: Prisma.TransactionClient, id: string) {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "PaymentRequest" WHERE "id" = ${id} FOR UPDATE`;
    if (locked.length === 0)
      throw new NotFoundException('Payment request not found');
    const req = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
    if (req.status !== 'pending') throw new ConflictException(ALREADY_HANDLED);
    return req;
  }
}
