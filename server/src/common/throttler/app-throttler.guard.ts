import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';

const ACCESS_COOKIE = 'mhs_at';

// Rate limiting on the API itself.
//
// Signed-in traffic is counted per USER, anonymous traffic per IP. A clinic
// shares one public address between the doctor's PC and every assistant PC, so
// a per-IP bucket alone throttles the whole practice because one assistant is
// bulk-uploading reports (each report is 2 POSTs + a PATCH + an activity line).
//
// The access token is VERIFIED before it names a bucket. A forged cookie fails
// verification and falls back to the IP bucket, so an attacker cannot mint
// unlimited buckets by inventing user ids. Verification is one HMAC; the DB is
// not touched here (JwtStrategy does the user lookup later, after the guard).
//
// The library adds `X-RateLimit-Limit/Remaining/Reset` to every response and
// `Retry-After` + 429 when a bucket is exhausted; the 429 message comes from
// `errorMessage` in ThrottlerModule.forRoot (app.module.ts) because the client
// shows `body.message` to the doctor verbatim.
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
  ) {
    super(options, storage, reflector);
  }

  protected async getTracker(req: Request): Promise<string> {
    const cookieToken = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const token = cookieToken ?? headerToken;
    if (token) {
      try {
        const payload = this.jwt.verify<{ sub?: string }>(token);
        if (payload?.sub) return `user:${payload.sub}`;
      } catch {
        /* invalid or expired → anonymous bucket */
      }
    }
    return `ip:${req.ip}`;
  }
}
