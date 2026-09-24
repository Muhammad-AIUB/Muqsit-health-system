import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

// Turns Prisma errors into actionable HTTP answers instead of a bare 500.
//
//  P2002 unique violation → 409. Once `manual-opd-token-unique.sql` /
//        `manual-ipd-bed-unique.sql` are applied, a concurrent duplicate is a
//        conflict the doctor can act on, not a server fault.
//  P2025 record not found  → 404 (same shape as every other "not yours / gone").
//  P1xxx connection errors → 503 + Retry-After. The client can retry a READ
//        silently; a WRITE is reported honestly as "may not have been saved".
//
// ⚕️ The message never claims a state the server cannot know: a timeout on a
// commit is ambiguous, so it says "may not", never "was not".
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientInitializationError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger(PrismaExceptionFilter.name);

  catch(
    e:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientInitializationError,
    host: ArgumentsHost,
  ) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const code =
      e instanceof Prisma.PrismaClientKnownRequestError
        ? e.code
        : (e.errorCode ?? 'P1001');

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message = 'Something went wrong on the server. Please try again.';

    if (code === 'P2002') {
      status = HttpStatus.CONFLICT;
      error = 'Conflict';
      message =
        'This record already exists — it may have been saved a moment ago. Refresh and check before saving again.';
    } else if (code === 'P2025') {
      status = HttpStatus.NOT_FOUND;
      error = 'Not Found';
      message = 'Not found';
    } else if (code.startsWith('P1')) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      error = 'Service Unavailable';
      message =
        'The database is unreachable right now. Your entry may not have been saved — please check the record before entering it again.';
      res.setHeader('Retry-After', '5');
    }

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.log.error(
        `${req.method} ${req.originalUrl} → Prisma ${code}: ${e.message}`,
      );
    } else {
      this.log.warn(
        `${req.method} ${req.originalUrl} → Prisma ${code} → ${status}`,
      );
    }

    res.status(status).json({ statusCode: status, message, error, code });
  }
}
