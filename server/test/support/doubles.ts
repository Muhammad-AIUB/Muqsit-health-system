import type { ThrottlerStorage } from '@nestjs/throttler';

// FAKE — a working in-memory stand-in for MailService. Nothing leaves the
// process; tests read the code the user would have received by email.
export class FakeMailService {
  readonly otps: { email: string; code: string }[] = [];
  readonly approvals: { email: string; name: string }[] = [];

  async sendVerificationOtp(email: string, code: string): Promise<void> {
    this.otps.push({ email, code });
  }

  async sendAccountApproved(email: string, name: string): Promise<void> {
    this.approvals.push({ email, name });
  }

  lastOtp(email: string): string | undefined {
    const hits = this.otps.filter((o) => o.email.toLowerCase() === email.toLowerCase());
    return hits[hits.length - 1]?.code;
  }

  // register() issues the code in the background, after the HTTP response.
  async waitForOtp(email: string, timeoutMs = 5000): Promise<string> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const code = this.lastOtp(email);
      if (code) return code;
      if (Date.now() > until) throw new Error(`no OTP captured for ${email}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  clear(): void {
    this.otps.length = 0;
    this.approvals.length = 0;
  }
}

// STUB — a rate-limit store that never counts, so a suite making hundreds of
// requests from one address is not answered 429. The guard itself still runs;
// auth.int-spec boots with the real store to prove the limit fires.
export const noThrottleStorage: ThrottlerStorage = {
  async increment() {
    return { totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
  },
};
