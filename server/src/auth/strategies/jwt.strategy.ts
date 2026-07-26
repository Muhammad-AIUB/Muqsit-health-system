import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

const ACCESS_COOKIE = 'mhs_at';

// Read the access token from the httpOnly cookie. Bearer-header fallback is
// kept only so server-to-server tooling (cron jobs, healthchecks) can still
// authenticate; the browser flow uses cookies exclusively.
const cookieExtractor = (req: Request): string | null => {
  return (req?.cookies?.[ACCESS_COOKIE] as string | undefined) ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey:
        config.get<string>('JWT_SECRET') ??
        (() => {
          throw new Error('JWT_SECRET is not configured');
        })(),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException();
    // Re-check account status on every request so an admin suspend / reject /
    // soft-delete takes effect within one request instead of one access-token
    // lifetime (findings #5, #16). Admins are exempt. Because validate()
    // already round-trips to the DB for the user, this adds no extra query.
    if (
      user.role !== 'admin' &&
      (user.deletedAt ||
        user.approvalStatus === 'suspended' ||
        user.approvalStatus === 'rejected')
    ) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: user.email, name: user.name, displayName: user.displayName, role: user.role, accountTier: user.accountTier };
  }
}
