import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ROW_LOCK_TX } from '../prisma/row-lock';
import { dhakaDayKey, isDayKey } from '../opd/dhaka-day';
import { OpdService } from '../opd/opd.service';
import {
  ChambersService,
  DEFAULT_CHAMBER_NAME,
} from '../chambers/chambers.service';
import { slotTimes } from '../opd/schedule';
import {
  appointmentMessage,
  isSayableTime,
  oneLine,
  SmsLanguage,
  bareDoctorName,
} from './appointment-message';
import {
  SMS_COST_TAKA_PER_SEGMENT,
  SmsEncoding,
  smsSegments,
} from './segments';
import { normaliseBdMobile, SmsService } from './sms.service';
import { SmsWalletService } from './sms-wallet.service';

export const SMS_NOT_A_DAY = 'That is not a day on the calendar.';
export const SMS_PAST_DAY = 'SMS cannot be sent for a day that has passed.';
export const SMS_EMPTY_DAY = "No one is in this day's queue.";
export const SMS_NOBODY = 'No patient of this day can be sent an SMS.';
export const SMS_NOT_CONFIGURED =
  'SMS gateway is not configured. No SMS was sent and nothing was charged.';
export const SMS_CHANGED =
  'The queue or the message changed since you checked. Check again before sending.';
export const SMS_SENDING =
  'These SMS are being sent already. Wait for that to finish.';
export const SMS_NO_CHAMBER =
  "Add this chamber's name or address in Settings → Chambers before sending SMS.";
export const SMS_NO_DOCTOR_NAME =
  'Add your name in Settings → Profile before sending SMS.';

/** A second send of a message a patient was already sent within this time needs a confirm. */
export const SMS_REPEAT_WINDOW_MS = 30 * 60 * 1000;
/** A job still "sending" after this long is taken as cut short (the process ended). */
const SENDING_STALE_MS = 30 * 60 * 1000;

export interface SmsPlanRow {
  visitId: string;
  serial: number;
  name: string;
  /** The number as it will be sent (`01XXXXXXXXX`), or null when it cannot be. */
  mobile: string | null;
  /** The serial's time, minutes since midnight (the Print Queue's), or null. */
  minutes: number | null;
  message: string | null;
  encoding: SmsEncoding | null;
  segments: number;
  /** Why this patient will not be sent one — in the doctor's words. */
  skip: string | null;
}

export interface SmsPlan {
  day: string;
  language: SmsLanguage;
  doctorName: string;
  /** The chamber whose queue this is (the `X-Chamber` the screen sent, resolved):
   *  `id` null is the default chamber; `text` is what the message says. */
  chamber: { id: string | null; name: string; address: string; text: string };
  /** What stops ANY message being built, in the doctor's words. */
  problems: string[];
  rows: SmsPlanRow[];
  recipients: number;
  segments: number;
  cost: number;
  costPerSegment: number;
  balance: number;
  gatewayConfigured: boolean;
  canSend: boolean;
  /** Fingerprint of what would be sent; `send` must be given the same. */
  signature: string;
}

export type SmsResultStatus = 'sent' | 'failed' | 'skipped';

export interface SmsSendResultRow {
  visitId: string;
  serial: number;
  name: string;
  mobile: string | null;
  message: string | null;
  segments: number;
  status: SmsResultStatus;
  detail: string;
}

export interface SmsSendAnswer {
  jobId: string;
  day: string;
  language: SmsLanguage;
  results: SmsSendResultRow[];
  sent: number;
  failed: number;
  skipped: number;
  charged: number;
  balance: number;
}

// ⚕️ The appointment SMS to every patient of a day's queue (physician's sheet,
// 28/10/2026). Rules that are safety, not style:
// - Today or a LATER day only, refused HERE (a client cannot send for a day
//   that has passed); an empty day is refused too.
// - The times are the Print Queue's: the queue in the order shown
//   (`OpdService.list`) and `slotTimes` over the day's schedule
//   (`OpdService.getSchedule`) — the same function the client runs.
// - A number that is missing or not a Bangladeshi mobile is listed as skipped,
//   never guessed (`normaliseBdMobile`); so is a time past midnight, which no
//   sample words.
// - Never sent by itself: `preview` sends nothing and charges nothing; `send`
//   is a press of the doctor's, and is given the preview's fingerprint so what
//   is sent is what the doctor saw.
// - Only messages the gateway took are charged: the job's cost is reserved
//   when it starts and what did not go is refunded when it ends. An
//   unconfigured gateway logs instead of sending and answers "ok" — so `send`
//   refuses before anything is reserved, and never says "sent" for it.
// - One job per (doctor, chamber, day, language) at a time, decided under an advisory
//   lock; a message a patient was sent within 30 minutes is sent again only
//   with `confirmRepeat`.
@Injectable()
export class OpdSmsService {
  private readonly log = new Logger(OpdSmsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly opd: OpdService,
    private readonly sms: SmsService,
    private readonly wallet: SmsWalletService,
    private readonly chambers: ChambersService,
  ) {}

  private requireSendableDay(day: string): void {
    if (!isDayKey(day)) throw new BadRequestException(SMS_NOT_A_DAY);
    if (day < dhakaDayKey()) throw new BadRequestException(SMS_PAST_DAY);
  }

  async preview(
    doctorId: string,
    chamberId: string | null,
    input: { date: string; language: SmsLanguage },
  ): Promise<SmsPlan> {
    return this.plan(doctorId, chamberId, input);
  }

  // ⚕️ The chamber the message names is the one whose queue this is — the
  // `OpdChamber` `ChambersService.resolve` answered for the screen's X-Chamber
  // (null = the default chamber) — never a chamber picked separately, or a
  // patient of one chamber could be told the other's address.
  private async chamberOf(doctorId: string, chamberId: string | null) {
    const all = await this.chambers.list(doctorId);
    const c =
      chamberId === null
        ? all.find((x) => x.isDefault)
        : all.find((x) => x.id === chamberId);
    const name = oneLine(c?.name);
    const address = oneLine(c?.address);
    // The default chamber's own name is the app's ("Main chamber"), not the
    // doctor's: it says nothing to a patient, so only its address is used.
    const ownName = c?.isDefault && name === DEFAULT_CHAMBER_NAME ? '' : name;
    const text = [ownName, address].filter(Boolean).join(', ');
    return { id: chamberId, name, address, text };
  }

  private async plan(
    doctorId: string,
    chamberId: string | null,
    { date: day, language }: { date: string; language: SmsLanguage },
  ): Promise<SmsPlan> {
    this.requireSendableDay(day);
    const rows = await this.opd.list(doctorId, day, chamberId);
    if (rows.length === 0) throw new BadRequestException(SMS_EMPTY_DAY);
    const schedule = await this.opd.getSchedule(doctorId, day, chamberId);
    const times = slotTimes(rows.length, schedule);

    const doctor = await this.prisma.user.findUnique({
      where: { id: doctorId },
      select: { name: true, displayName: true },
    });
    const doctorName = bareDoctorName(
      doctor?.displayName || doctor?.name || '',
    );
    const chamber = await this.chamberOf(doctorId, chamberId);

    const problems: string[] = [];
    if (!doctorName) problems.push(SMS_NO_DOCTOR_NAME);
    if (!chamber.text) problems.push(SMS_NO_CHAMBER);

    const planRows: SmsPlanRow[] = rows.map((v, i) => {
      const base = {
        visitId: v.id,
        serial: i + 1,
        name: v.name,
        mobile: null,
        minutes: null,
        message: null,
        encoding: null,
        segments: 0,
      };
      const t = times[i];
      const minutes = t === undefined ? null : t;
      if (v.status === 'done' || v.rxStatus === 'complete')
        return { ...base, minutes, skip: 'Already seen.' };
      const mobile = normaliseBdMobile(v.phone ?? '');
      if (!mobile) {
        return {
          ...base,
          minutes,
          skip:
            v.phone && v.phone.trim()
              ? `Not a valid Bangladeshi mobile number: ${v.phone}`
              : 'No mobile number.',
        };
      }
      if (t === undefined)
        return {
          ...base,
          mobile,
          skip: 'No time could be worked out from the schedule.',
        };
      if (!isSayableTime(t))
        return {
          ...base,
          mobile,
          minutes,
          skip: 'The serial time falls after midnight.',
        };
      if (problems.length > 0) return { ...base, mobile, minutes, skip: null };
      const message = appointmentMessage(language, {
        patientName: v.name,
        // The sex recorded on the queue row (what Print Queue prints): জনাব /
        // জনাবা, Mr. / Ms. — none when it is not recorded.
        sex: v.gender,
        doctorName,
        chamber: chamber.text,
        minutes: t,
      }) as string;
      const count = smsSegments(message);
      return {
        ...base,
        mobile,
        minutes,
        message,
        encoding: count.encoding,
        segments: count.segments,
        skip: null,
      };
    });

    const sendable = planRows.filter((r) => r.message !== null);
    const segments = sendable.reduce((n, r) => n + r.segments, 0);
    const cost = segments * SMS_COST_TAKA_PER_SEGMENT;
    const balance = await this.wallet.balance(doctorId);
    const gatewayConfigured = this.sms.configured;
    const signature = createHash('sha256')
      .update(
        JSON.stringify([
          day,
          language,
          chamber.id,
          chamber.text,
          sendable.map((r) => [r.visitId, r.mobile, r.message]),
        ]),
      )
      .digest('hex');
    return {
      day,
      language,
      doctorName,
      chamber,
      problems,
      rows: planRows,
      recipients: sendable.length,
      segments,
      cost,
      costPerSegment: SMS_COST_TAKA_PER_SEGMENT,
      balance,
      gatewayConfigured,
      canSend:
        problems.length === 0 &&
        sendable.length > 0 &&
        gatewayConfigured &&
        balance >= cost,
      signature,
    };
  }

  private lockJob(
    tx: Prisma.TransactionClient,
    doctorId: string,
    day: string,
    language: string,
    chamberId: string | null,
  ) {
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sms:${doctorId}:${chamberId ?? 'default'}:${day}:${language}`}))`;
  }

  async send(
    doctorId: string,
    userId: string | null,
    chamberId: string | null,
    input: {
      date: string;
      language: SmsLanguage;
      previewSignature: string;
      confirmRepeat?: boolean;
    },
  ): Promise<SmsSendAnswer> {
    const plan = await this.plan(doctorId, chamberId, input);
    if (plan.problems.length > 0)
      throw new BadRequestException(plan.problems.join(' '));
    // ⚕️ Before anything is reserved: an unconfigured gateway would log the
    // messages and answer "ok", and the doctor would be charged for nothing.
    if (!plan.gatewayConfigured) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        message: SMS_NOT_CONFIGURED,
        code: 'SMS_NOT_CONFIGURED',
      });
    }
    if (plan.recipients === 0) throw new BadRequestException(SMS_NOBODY);
    if (plan.signature !== input.previewSignature) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: SMS_CHANGED,
        code: 'SMS_CHANGED',
      });
    }
    const sendable = plan.rows.filter((r) => r.message !== null);

    const job = await this.prisma.$transaction(async (tx) => {
      await this.lockJob(tx, doctorId, plan.day, plan.language, chamberId);
      const since = new Date(
        Date.now() - Math.max(SMS_REPEAT_WINDOW_MS, SENDING_STALE_MS),
      );
      const recent = await tx.smsSendJob.findMany({
        where: {
          doctorId,
          chamberId,
          day: plan.day,
          language: plan.language,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (recent.some((j) => j.status === 'sending')) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: SMS_SENDING,
          code: 'SMS_SENDING',
        });
      }
      // A patient who was sent this very message (same number, same words) in
      // the last 30 minutes would get it twice.
      const repeatSince = Date.now() - SMS_REPEAT_WINDOW_MS;
      const sentBefore = new Map<string, Date>();
      for (const j of recent) {
        if (j.createdAt.getTime() < repeatSince) continue;
        for (const r of (Array.isArray(j.results)
          ? j.results
          : []) as unknown as SmsSendResultRow[]) {
          if (r && r.status === 'sent' && r.mobile && r.message) {
            const key = `${r.mobile}\n${r.message}`;
            if (!sentBefore.has(key)) sentBefore.set(key, j.createdAt);
          }
        }
      }
      const repeats = sendable.filter((r) =>
        sentBefore.has(`${r.mobile}\n${r.message}`),
      );
      if (repeats.length > 0 && !input.confirmRepeat) {
        const first = repeats
          .map((r) => sentBefore.get(`${r.mobile}\n${r.message}`) as Date)
          .sort((a, b) => a.getTime() - b.getTime())[0];
        const ago = Math.max(
          1,
          Math.round((Date.now() - first.getTime()) / 60000),
        );
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          code: 'SMS_REPEAT',
          message: `${repeats.length} of these patients were sent this same SMS ${ago} minute${ago === 1 ? '' : 's'} ago. Sent again, they will get it twice.`,
        });
      }
      const created = await tx.smsSendJob.create({
        data: {
          doctorId,
          chamberId,
          day: plan.day,
          language: plan.language,
          reserved: plan.cost,
          createdById: userId,
        },
      });
      await this.wallet.apply(tx, doctorId, -plan.cost, {
        reason: 'send',
        ref: created.id,
        note: `${plan.recipients} SMS (${plan.segments} messages) for ${plan.day}, ${plan.language === 'bn' ? 'Bangla' : 'English'}`,
        createdById: userId,
      });
      return created;
    }, ROW_LOCK_TX);

    const results: SmsSendResultRow[] = plan.rows
      .filter((r) => r.message === null)
      .map((r) => ({
        visitId: r.visitId,
        serial: r.serial,
        name: r.name,
        mobile: r.mobile,
        message: null,
        segments: 0,
        status: 'skipped' as const,
        detail: r.skip ?? 'Not sent.',
      }));
    let charged = 0;
    try {
      for (const r of sendable) {
        // ⚕️ `send` never throws and never answers a bare boolean: its detail is
        // what the doctor is told for this patient.
        const res = await this.sms.send(
          r.mobile as string,
          r.message as string,
        );
        if (res.ok) charged += r.segments * SMS_COST_TAKA_PER_SEGMENT;
        results.push({
          visitId: r.visitId,
          serial: r.serial,
          name: r.name,
          mobile: r.mobile,
          message: r.message,
          segments: r.segments,
          status: res.ok ? 'sent' : 'failed',
          detail: res.detail,
        });
        if (!res.ok)
          this.log.warn(
            `[sms] job ${job.id}: ${r.mobile} not sent — ${res.detail}`,
          );
        // Kept as it goes, so a job cut short still says what went.
        await this.prisma.smsSendJob
          .update({
            where: { id: job.id },
            data: { results: results as unknown as Prisma.InputJsonValue },
          })
          .catch((e) =>
            this.log.error(
              `[sms] job ${job.id}: could not record progress — ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
      }
    } finally {
      // ⚕️ Only what the gateway took is charged: the rest of the reservation
      // goes back, with its own ledger line.
      const refund = plan.cost - charged;
      results.sort((a, b) => a.serial - b.serial);
      await this.prisma.$transaction(async (tx) => {
        if (refund > 0) {
          await this.wallet.apply(tx, doctorId, refund, {
            reason: 'refund',
            ref: job.id,
            note: 'SMS not sent',
            createdById: userId,
          });
        }
        await tx.smsSendJob.update({
          where: { id: job.id },
          data: {
            status: 'done',
            charged,
            finishedAt: new Date(),
            results: results as unknown as Prisma.InputJsonValue,
          },
        });
      }, ROW_LOCK_TX);
    }

    const count = (s: SmsResultStatus) =>
      results.filter((r) => r.status === s).length;
    return {
      jobId: job.id,
      day: plan.day,
      language: plan.language,
      results,
      sent: count('sent'),
      failed: count('failed'),
      skipped: count('skipped'),
      charged,
      balance: await this.wallet.balance(doctorId),
    };
  }
}
