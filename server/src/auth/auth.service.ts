import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresInSec: number;
  refreshExpiresAt: Date;
}

export interface SessionResult {
  tokens: SessionTokens;
  user: { id: string; email: string; name: string; role: string };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Registration ──────────────────────────────────────────
  async register(dto: RegisterDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      // Verification happens exactly once, at sign-up. An account that never
      // completed OTP verification is incomplete — replace it and start over.
      if (!existing.emailVerified && existing.role !== 'admin') {
        await this.prisma.user.delete({ where: { id: existing.id } });
      } else {
        throw new ConflictException('An account with this email already exists');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    await this.users.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
      role: 'professional',
      mobile: dto.mobile,
      profession: dto.profession,
      registrationNo: dto.registrationNo ?? null,
      nidNo: dto.nidNo,
      designation: dto.designation,
      specialty: dto.specialty,
      institutionCode: dto.institutionCode ?? null,
      registrationCertUrl: dto.registrationCertUrl,
      nidFrontUrl: dto.nidFrontUrl,
      nidBackUrl: dto.nidBackUrl,
      profilePictureUrl: dto.profilePictureUrl ?? null,
      emailVerified: false,
      approvalStatus: 'pending',
      accountTier: 'secondary', // every new sign-up starts as secondary
    });

    // Fire-and-forget: OTP hashing + DB writes + email happen in the
    // background so the user gets their response immediately.
    void this.issueOtp(dto.email).catch((e) => {
      this.logger.error(`Failed to issue OTP for ${dto.email}: ${e?.message ?? e}`);
    });

    return {
      message:
        'Registration received. We emailed a 6-digit verification code to your address.',
      email: dto.email,
    };
  }

  // ── OTP issuing / verification ────────────────────────────
  private async issueOtp(email: string) {
    const code = (Math.floor(100000 + Math.random() * 900000)).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const minutes = Number(this.config.get<string>('OTP_EXPIRES_MIN') ?? 10);
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

    // Invalidate any previous unconsumed codes for this email.
    await this.prisma.emailOtp.updateMany({
      where: { email, consumed: false },
      data: { consumed: true },
    });

    await this.prisma.emailOtp.create({
      data: { email, codeHash, expiresAt },
    });

    // Fire-and-forget: don't make the HTTP response wait 3–5s for SMTP.
    // If delivery fails the user can hit "Resend code".
    void this.mail.sendVerificationOtp(email, code).catch((e) => {
      this.logger.error(`Failed to send OTP email to ${email}: ${e?.message ?? e}`);
    });
  }

  async resendOtp(email: string) {
    const user = await this.users.findByEmail(email);
    if (!user) throw new BadRequestException('No account found for this email');
    if (user.emailVerified) {
      return { message: 'Email already verified. You can sign in.' };
    }
    await this.issueOtp(email);
    return { message: 'A new verification code has been sent.' };
  }

  async verifyEmail(email: string, otp: string) {
    const record = await this.prisma.emailOtp.findFirst({
      where: { email, consumed: false },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      throw new BadRequestException('No active code. Please request a new one.');
    }
    if (record.expiresAt < new Date()) {
      throw new BadRequestException('Code expired. Please request a new one.');
    }
    if (record.attempts >= 5) {
      throw new BadRequestException('Too many attempts. Request a new code.');
    }

    const ok = await bcrypt.compare(otp, record.codeHash);
    if (!ok) {
      await this.prisma.emailOtp.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Incorrect code.');
    }

    await this.prisma.emailOtp.update({
      where: { id: record.id },
      data: { consumed: true },
    });
    await this.users.setEmailVerified(email);

    return {
      message:
        'Email verified. Your account is now awaiting admin approval before you can sign in.',
    };
  }

  // ── Login ─────────────────────────────────────────────────
  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string } = {}): Promise<SessionResult> {
    const user = await this.users.findByEmailOrMobile(dto.identifier.trim());
    if (!user)
      throw new UnauthorizedException('Invalid email/phone or password');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok)
      throw new UnauthorizedException('Invalid email/phone or password');

    // Admins skip the verification/approval gates.
    if (user.role !== 'admin') {
      if (!user.emailVerified) {
        throw new ForbiddenException(
          'Your registration was not completed. Please sign up again.',
        );
      }
      if (user.approvalStatus === 'pending') {
        throw new ForbiddenException(
          'Your account is awaiting admin approval.',
        );
      }
      if (user.approvalStatus === 'suspended') {
        throw new ForbiddenException(
          'Your account is temporarily suspended. Please contact support.',
        );
      }
      if (user.approvalStatus === 'rejected') {
        throw new ForbiddenException(
          user.rejectionReason
            ? `Your registration was rejected: ${user.rejectionReason}`
            : 'Your registration was rejected. Please contact support.',
        );
      }
    }

    const tokens = await this.startSession(user, randomUUID(), meta);
    this.logger.log(`login user=${user.id} ip=${meta.ip ?? '-'}`);
    return { tokens, user: this.publicUser(user) };
  }

  // ── Refresh token rotation ────────────────────────────────
  // The client presents the opaque refresh string from its cookie. We hash
  // it the same way it was stored and look it up. Three outcomes:
  //   • valid + unrevoked → rotate (revoke old, issue new in same family)
  //   • token unknown / expired → 401, force re-login
  //   • token *was* valid but is already revoked → assume theft, revoke the
  //     entire family so neither the attacker nor the victim can refresh
  async refresh(rawToken: string, meta: { ip?: string; userAgent?: string } = {}): Promise<SessionResult> {
    if (!rawToken) throw new UnauthorizedException('No refresh token');
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!record) throw new UnauthorizedException('Invalid refresh token');

    if (record.revokedAt) {
      // Reuse of a revoked token → kill the whole family.
      await this.prisma.refreshToken.updateMany({
        where: { family: record.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(
        `refresh-reuse user=${record.userId} family=${record.family} ip=${meta.ip ?? '-'} — family revoked`,
      );
      throw new UnauthorizedException('Session revoked');
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Rotation: mark the presented token as revoked and issue a new one
    // sharing the same family id.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.startSession(record.user, record.family, meta);
    return { tokens, user: this.publicUser(record.user) };
  }

  async revoke(rawToken: string | undefined) {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Force every device this user is signed in on to re-authenticate. The
  // access token (mhs_at) stays valid until it expires on its own (≤ 15
  // min by default), but every refresh attempt will fail, so sessions die
  // within at most one access-token lifetime. Use this when an admin
  // suspends, rejects, or otherwise needs to evict a user immediately.
  async revokeAllForUser(userId: string): Promise<number> {
    const res = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count > 0) {
      this.logger.log(`revoke-all user=${userId} sessions=${res.count}`);
    }
    return res.count;
  }

  // ── Internals ─────────────────────────────────────────────
  private async startSession(
    user: User,
    family: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<SessionTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessExpiresIn = this.config.get<string>('JWT_EXPIRES_IN') ?? '15m';
    const accessToken = this.jwt.sign(payload, { expiresIn: accessExpiresIn });
    const accessExpiresInSec = this.parseDurationSec(accessExpiresIn);

    const refreshDays = Number(this.config.get<string>('REFRESH_EXPIRES_DAYS') ?? 30);
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        family,
        expiresAt: refreshExpiresAt,
        ip: meta.ip?.slice(0, 64) ?? null,
        userAgent: meta.userAgent?.slice(0, 256) ?? null,
      },
    });

    return { accessToken, refreshToken, accessExpiresInSec, refreshExpiresAt };
  }

  private hashToken(raw: string): string {
    // SHA-256 is fine here — the input is 48 random bytes (≈ 384 bits of
    // entropy), so brute-force is infeasible and bcrypt's slowness adds no
    // security, only latency on every authenticated request.
    return createHash('sha256').update(raw).digest('hex');
  }

  private publicUser(user: User) {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  private parseDurationSec(input: string): number {
    // Best-effort parse of "15m" / "1h" / "30s" / "7d" / plain seconds —
    // matches @nestjs/jwt's `ms`-style accepted formats.
    const m = /^(\d+)\s*(s|m|h|d)?$/i.exec(input.trim());
    if (!m) return 900;
    const n = Number(m[1]);
    const unit = (m[2] ?? 's').toLowerCase();
    const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
    return n * mult;
  }
}
