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
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

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
  async login(dto: LoginDto) {
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

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwt.sign(payload);
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
