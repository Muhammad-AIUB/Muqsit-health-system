/**
 * Phase-1 spike: prove the SMS gateway works and measure real delivery latency.
 *
 *   npx ts-node scripts/sms-test.ts 01XXXXXXXXX
 *
 * Sends ONE real SMS and spends one credit from the account balance. It prints
 * the round-trip time and the gateway's raw body — the raw body is the point,
 * because the success/failure shape has to be learned from real traffic before
 * any OTP flow can trust it.
 *
 * Reads SMS_CUSTOMER_ID / SMS_API_KEY from server/.env. Credentials never live
 * in this file.
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SmsModule } from '../src/sms/sms.module';
import { SmsService } from '../src/sms/sms.service';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), SmsModule] })
class SmsTestModule {}

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: npx ts-node scripts/sms-test.ts 01XXXXXXXXX');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(SmsTestModule, {
    logger: ['log', 'warn', 'error'],
  });
  const sms = app.get(SmsService);

  if (!sms.configured) {
    console.error('\nSMS_CUSTOMER_ID / SMS_API_KEY are not set in server/.env — nothing was sent.');
    await app.close();
    process.exit(1);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const message = `Muqsit Health System test code: ${code}. Ignore this message.`;

  console.log(`\nSending to ${to} ...`);
  const r = await sms.send(to, message);

  console.log('\n--- result ---');
  console.log(`ok      : ${r.ok}`);
  console.log(`detail  : ${r.detail}`);
  console.log(`latency : ${r.ms} ms`);
  console.log(`raw     : ${r.raw ?? '(none)'}`);
  console.log(`code    : ${code}   <- check the handset for this`);
  console.log('---');
  console.log('\nNote the wall-clock gap between this line and the phone buzzing.');
  console.log('The API round-trip above is NOT delivery time; the gateway queues.');

  await app.close();
  process.exit(r.ok ? 0 : 1);
}

void main();
