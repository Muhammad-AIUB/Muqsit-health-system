import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
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
      throw new ConflictException('An account with this email already exists');
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
    });

    await this.issueOtp(dto.email);

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

    await this.mail.sendVerificationOtp(email, code);
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
          'Please verify your email before signing in.',
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
