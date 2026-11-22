import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ROW_LOCK_TX } from '../prisma/row-lock';
import { OWNER_NOT_ISOLATED, patientReachWhere } from '../patients/reach';
import { normaliseBdMobile, SmsService, type SmsResult } from '../sms/sms.service';
import {
  ageOf,
  CODE_TTL_MS,
  codeMessage,
  hashCode,
  HOUR_MS,
  MAX_CODES_PER_PATIENT_PER_HOUR,
  MAX_WRONG_TRIES,
  maskMobile,
  newCode,
  readCode,
  RESEND_AFTER_MS,
  sameHash,
} from './code';

/** What a doctor is told about a patient of another practice BEFORE the patient's
 *  own code has been entered: enough to tell one family member from another on
 *  the same phone, nothing of the record, and never whose patient it is. */
export interface AccessCandidate {
  id: string;
  name: string;
  sex: string | null;
  age: number | null;
}

export const NOT_A_MOBILE = "Enter the patient's mobile number: 11 digits, starting with 01.";
export const SMS_UNAVAILABLE =
  "The text message service is not set up on this server, so the patient's code cannot be sent.";
export const NO_SMS_NUMBER =
  "This patient's number cannot receive a text message, so a code cannot be sent.";
export const ISOLATED_MESSAGE =
  "This practice works on its own patients only, so another doctor's patients cannot be opened.";

// ⚕️ Opening another practice's patient with the patient's own code (physician,
// 16/11/2026): the doctor types the patient's mobile, the patient's phone gets a
// code, the doctor enters it. Once entered, the practice reaches that patient for
// good — as a supervising doctor does (`patients/reach.ts`) — unless it or the
// patient's owner is isolated (admin Profile settings), when it does not.
//
// Every question about whose patient is whose is asked of `patientReachWhere` /
// `OWNER_NOT_ISOLATED`, and every route here takes the practice from the
// workstation: a doctorId is never a request's word.
@Injectable()
export class PatientAccessService {
  private readonly log = new Logger(PatientAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  private secret(): string {
    return this.config.getOrThrow<string>('JWT_SECRET');
  }

  private async practice(doctorId: string) {
    const doctor = await this.prisma.user.findUnique({
      where: { id: doctorId },
      select: { id: true, name: true, displayName: true, isolated: true },
    });
    if (!doctor) throw new ForbiddenException('You do not have access to this workstation');
    return doctor;
  }

  /**
   * The practice and the patient a code is about — or the reason there is none.
   * An isolated practice is refused (403); a patient that does not exist, or whose
   * owner is isolated, is "not found" (the same answer for both: nobody learns
   * that an isolated practice has a patient by this number). `open` says the
   * practice already reaches the patient.
   */
  private async subject(doctorId: string, patientId: string) {
    const me = await this.practice(doctorId);
    if (me.isolated) throw new ForbiddenException(ISOLATED_MESSAGE);
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, ...OWNER_NOT_ISOLATED },
      select: { id: true, mobile: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    const reached = await this.prisma.patient.findFirst({
      where: { id: patientId, ...patientReachWhere(doctorId) },
      select: { id: true },
    });
    return { me, patient, open: !!reached };
  }

  /**
   * The patients of OTHER practices that carry this number — the list the doctor
   * picks from before a code is asked for. Own, supervised and already-opened
   * patients are not here (they are in `GET /patients/by-mobile`), nor are the
   * patients of an isolated practice. An isolated practice is shown nothing.
   */
  async search(doctorId: string, rawMobile: string): Promise<{ isolated: boolean; patients: AccessCandidate[] }> {
    const mobile = normaliseBdMobile(rawMobile);
    if (!mobile) throw new BadRequestException(NOT_A_MOBILE);
    const me = await this.practice(doctorId);
    if (me.isolated) return { isolated: true, patients: [] };

    // the number as normalised, and as it may have been typed into the record
    const numbers = [...new Set([mobile, rawMobile.trim()])];
    // What the practice already reaches on this number, asked with the ONE positive
    // `where`. Not `NOT: patientReachWhere(…)` in the search below: for a patient with
    // no owner `"doctorId" = x` is NULL, NOT NULL is NULL, and the row would silently
    // drop out — the ownerless patient this list exists to let a practice claim.
    const reached = await this.prisma.patient.findMany({
      where: { mobile: { in: numbers }, ...patientReachWhere(doctorId) },
      select: { id: true },
    });
    const rows = await this.prisma.patient.findMany({
      where: {
        mobile: { in: numbers },
        AND: [OWNER_NOT_ISOLATED],
        id: { notIn: reached.map((r) => r.id) },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: 20,
      select: { id: true, name: true, sex: true, dob: true, age: true, ageAsOfYear: true },
    });
    const now = new Date();
    return {
      isolated: false,
      patients: rows.map((p) => ({ id: p.id, name: p.name, sex: p.sex, age: ageOf(p, now) })),
    };
  }

  /**
   * Send the patient's phone a code for this practice. The code is never in the
   * answer: it is in the patient's hands and on the table only as a keyed hash.
   */
  async requestCode(
    doctorId: string,
    patientId: string,
  ): Promise<{ sentTo: string; expiresInSeconds: number; resendAfterSeconds: number }> {
    const { me, patient, open } = await this.subject(doctorId, patientId);
    if (open) throw new ConflictException('This patient is already open in your practice.');
    const mobile = normaliseBdMobile(patient.mobile ?? '');
    if (!mobile) throw new UnprocessableEntityException(NO_SMS_NUMBER);
    // An unconfigured gateway logs the message and answers ok — which would put
    // the patient's code in a log and tell the doctor it was sent. Refused first.
    if (!this.sms.configured) {
      throw new ServiceUnavailableException({ message: SMS_UNAVAILABLE, code: 'SMS_NOT_CONFIGURED' });
    }

    const code = newCode();
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      // One request at a time per patient: the cool-down and the hourly count are
      // read and the new code written under the same lock, so two presses together
      // cannot both get through.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`patient-access:${patientId}`}))`;
      const recent = await tx.patientAccessCode.findFirst({
        where: { patientId, doctorId, createdAt: { gt: new Date(now.getTime() - RESEND_AFTER_MS) } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (recent) {
        const wait = Math.max(1, Math.ceil((recent.createdAt.getTime() + RESEND_AFTER_MS - now.getTime()) / 1000));
        throw new HttpException(
          { message: `A code was just sent. You can ask for another in ${wait} seconds.`, code: 'CODE_COOLDOWN', retryInSeconds: wait },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const lastHour = await tx.patientAccessCode.count({
        where: { patientId, createdAt: { gt: new Date(now.getTime() - HOUR_MS) } },
      });
      if (lastHour >= MAX_CODES_PER_PATIENT_PER_HOUR) {
        throw new HttpException(
          { message: 'Too many codes have been sent to this patient. Try again later.', code: 'CODE_LIMIT' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      // The new code replaces this practice's earlier ones for the patient.
      await tx.patientAccessCode.deleteMany({ where: { patientId, doctorId, usedAt: null } });
      return tx.patientAccessCode.create({
        data: {
          patientId,
          doctorId,
          codeHash: hashCode(this.secret(), patientId, doctorId, code),
          expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        },
        select: { id: true },
      });
    }, ROW_LOCK_TX);

    // The message goes out after the lock is let go (the gateway may take 15 s).
    // A failure is told, never swallowed, and the code that never arrived is
    // removed so it cannot be guessed at. `send` is meant never to throw; if it
    // does, that is a failure too, not a code left standing.
    let sent: SmsResult;
    try {
      sent = await this.sms.send(mobile, codeMessage(code, me.displayName?.trim() || me.name));
    } catch (e) {
      sent = { ok: false, detail: e instanceof Error ? e.message : 'unknown error', ms: 0 };
    }
    if (!sent.ok) {
      await this.prisma.patientAccessCode.deleteMany({ where: { id: row.id } });
      this.log.warn(`code not sent patient=${patientId} practice=${doctorId}: ${sent.detail}`);
      throw new BadGatewayException({
        message: `The code could not be sent to the patient's phone: ${sent.detail}`,
        code: 'SMS_FAILED',
      });
    }
    this.log.log(`code sent patient=${patientId} practice=${doctorId}`);
    return {
      sentTo: maskMobile(mobile),
      expiresInSeconds: CODE_TTL_MS / 1000,
      resendAfterSeconds: RESEND_AFTER_MS / 1000,
    };
  }

  /**
   * The doctor enters what the patient was sent. A right code opens the patient
   * for this practice; a wrong one costs a try (5 a code); an old one is refused.
   * Entering it again after it worked is not an error: the patient is open.
   */
  async verify(doctorId: string, patientId: string, rawCode: unknown): Promise<{ ok: true; patientId: string }> {
    const code = readCode(rawCode);
    if (!code) {
      throw new BadRequestException({ message: 'The code is the 6 digits the patient received.', code: 'WRONG_CODE' });
    }
    const { patient, open } = await this.subject(doctorId, patientId);
    if (open) return { ok: true, patientId };

    const now = new Date();
    const row = await this.prisma.patientAccessCode.findFirst({
      where: { patientId, doctorId, usedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) {
      throw new BadRequestException({
        message: 'There is no code to check: it has expired, or none was sent. Ask for a new one.',
        code: 'CODE_EXPIRED',
      });
    }

    // Claim the try FIRST, atomically, and read the count it left: a burst of
    // guesses all read the same count otherwise. The right code spends a try as
    // well; five is the code's life.
    const claimed = await this.prisma.$queryRaw<{ attempts: number }[]>`
      UPDATE "PatientAccessCode" SET "attempts" = "attempts" + 1
      WHERE "id" = ${row.id} AND "attempts" < ${MAX_WRONG_TRIES} AND "usedAt" IS NULL
      RETURNING "attempts"
    `;
    if (claimed.length === 0) {
      throw new HttpException(
        { message: 'Too many wrong tries with this code. Ask for a new one.', code: 'CODE_LOCKED' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!sameHash(row.codeHash, hashCode(this.secret(), patientId, doctorId, code))) {
      const triesLeft = Math.max(0, MAX_WRONG_TRIES - claimed[0].attempts);
      throw new BadRequestException({
        message:
          triesLeft > 0
            ? `That code is not right. ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.`
            : 'That code is not right, and there are no tries left. Ask for a new code.',
        code: 'WRONG_CODE',
        triesLeft,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.patientAccessCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
      await tx.patientAccessGrant.upsert({
        where: { patientId_doctorId: { patientId, doctorId } },
        create: { patientId, doctorId, verifiedMobile: patient.mobile ?? '' },
        update: {},
      });
    });
    this.log.log(`access granted patient=${patientId} practice=${doctorId}`);
    return { ok: true, patientId };
  }
}
