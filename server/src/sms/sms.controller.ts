import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { WorkstationGuard } from '../workstations/workstation.guard';
import {
  ActiveWorkstation,
  WorkstationDoctorId,
} from '../workstations/workstation.decorator';
import type { Workstation } from '../workstations/workstations.service';
import {
  CreatePaymentRequestDto,
  CreditPaymentRequestDto,
  OpdSmsPreviewDto,
  OpdSmsSendDto,
  RejectPaymentRequestDto,
} from './dto/sms.dto';
import { OpdSmsService } from './opd-sms.service';
import { ChamberHeader } from '../chambers/chamber.decorator';
import { ChambersService } from '../chambers/chambers.service';
import { PaymentRequestsService } from './payment-requests.service';
import { SmsWalletService } from './sms-wallet.service';

const OWNER_ONLY =
  'Only the doctor can see the SMS ledger and make payment requests.';

function requireOwner(ws: Workstation): void {
  if (ws.role !== 'owner') throw new ForbiddenException(OWNER_ONLY);
}

// The appointment SMS to a day's queue. Same door as the OPD queue itself: any
// user of the practice's workstation, an assistant included — the queue is
// always open to an assistant (`opd.addPatient` is granted to every assistant,
// client/src/lib/permissions.ts#ALWAYS_ALLOWED). The practice's wallet pays.
@Controller('opd/sms')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class OpdSmsController {
  constructor(
    private readonly opdSms: OpdSmsService,
    private readonly chambers: ChambersService,
  ) {}

  // ⚕️ The chamber is the queue's, decided where the OPD queue decides it: the
  // `X-Chamber` header resolved for THIS practice (no header = the default
  // chamber; another practice's or a removed one = 404).
  private chamber(doctorId: string, raw: string | undefined) {
    return this.chambers.resolve(doctorId, raw);
  }

  // Sends nothing and charges nothing.
  @Post('preview')
  async preview(
    @WorkstationDoctorId() doctorId: string,
    @ChamberHeader() raw: string | undefined,
    @Body() dto: OpdSmsPreviewDto,
  ) {
    return this.opdSms.preview(
      doctorId,
      await this.chamber(doctorId, raw),
      dto,
    );
  }

  @Post('send')
  async send(
    @WorkstationDoctorId() doctorId: string,
    @ChamberHeader() raw: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OpdSmsSendDto,
  ) {
    return this.opdSms.send(
      doctorId,
      user?.id ?? null,
      await this.chamber(doctorId, raw),
      dto,
    );
  }
}

// The practice's SMS wallet and its payment requests (Settings → Payment).
@Controller('sms')
@UseGuards(JwtAuthGuard, WorkstationGuard)
export class SmsWalletController {
  constructor(
    private readonly wallet: SmsWalletService,
    private readonly payments: PaymentRequestsService,
  ) {}

  // The balance: anyone at the workstation (the OPD send box shows it).
  @Get('wallet')
  async getWallet(@WorkstationDoctorId() doctorId: string) {
    return { balance: await this.wallet.balance(doctorId) };
  }

  // The doctor only.
  @Get('ledger')
  ledger(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
  ) {
    requireOwner(ws);
    return this.wallet.ledger(doctorId);
  }

  @Get('payment-requests')
  myRequests(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
  ) {
    requireOwner(ws);
    return this.payments.mine(doctorId);
  }

  @Post('payment-requests')
  createRequest(
    @WorkstationDoctorId() doctorId: string,
    @ActiveWorkstation() ws: Workstation,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentRequestDto,
  ) {
    requireOwner(ws);
    return this.payments.create(doctorId, user.id, dto);
  }
}

// The admin console's side: pending requests, and crediting one.
@Controller('admin/payment-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminPaymentRequestsController {
  constructor(private readonly payments: PaymentRequestsService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.payments.list(status);
  }

  @Patch(':id/credit')
  credit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreditPaymentRequestDto,
  ) {
    return this.payments.credit(id, user.id, dto);
  }

  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RejectPaymentRequestDto,
  ) {
    return this.payments.reject(id, user.id, dto);
  }
}
