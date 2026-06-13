import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, SessionTokens } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResendOtpDto, VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthenticatedUser,
} from './decorators/current-user.decorator';

const ACCESS_COOKIE = 'mhs_at';
const REFRESH_COOKIE = 'mhs_rt';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('verify-email')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyEmail(dto.email, dto.otp);
  }

  @Post('resend-otp')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.auth.resendOtp(dto.email);
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, user } = await this.auth.login(dto, {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    this.setAuthCookies(res, tokens);
    return { user };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const { tokens, user } = await this.auth.refresh(raw ?? '', {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    this.setAuthCookies(res, tokens);
    return { user };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.auth.revoke(raw);
    this.clearAuthCookies(res);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  // ── Cookie helpers ────────────────────────────────────────
  // Both cookies are httpOnly so JavaScript can never read them — XSS that
  // gets a foothold in the page still cannot exfiltrate the session. The
  // refresh cookie is scoped to /api/auth so it is only attached to the
  // login / refresh / logout endpoints, not every API call.
  private setAuthCookies(res: Response, tokens: SessionTokens) {
    const secure = this.cookieSecure();
    const sameSite = this.cookieSameSite();
    const domain = this.config.get<string>('COOKIE_DOMAIN') || undefined;

    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: '/',
      maxAge: tokens.accessExpiresInSec * 1000,
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: '/api/auth',
      expires: tokens.refreshExpiresAt,
    });
  }

  private clearAuthCookies(res: Response) {
    const secure = this.cookieSecure();
    const sameSite = this.cookieSameSite();
    const domain = this.config.get<string>('COOKIE_DOMAIN') || undefined;
    res.clearCookie(ACCESS_COOKIE, { httpOnly: true, secure, sameSite, domain, path: '/' });
    res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure, sameSite, domain, path: '/api/auth' });
  }

  private cookieSecure(): boolean {
    const explicit = this.config.get<string>('COOKIE_SECURE');
    if (explicit) return explicit === 'true';
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private cookieSameSite(): 'lax' | 'strict' | 'none' {
    // SameSite=none is required when API and client live on unrelated
    // domains (cross-site). It only works alongside Secure=true, which the
    // browser enforces — that's why we tie it to COOKIE_SECURE in prod.
    const v = (this.config.get<string>('COOKIE_SAMESITE') ?? 'lax').toLowerCase();
    return v === 'strict' ? 'strict' : v === 'none' ? 'none' : 'lax';
  }
}
