import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';
import * as multer from 'multer';

// A malformed multipart request is the CALLER's mistake: 4xx, never 500
// (2026-10-16).
//
// Nest 10 turns multer's errors into HTTP errors by their MESSAGE
// (@nestjs/platform-express multer.utils.js#transformException). multer 2.4 —
// which the `overrides` entry in package.json installs under Nest 10 for its
// denial-of-service fixes — reworded "Unexpected field", and its fixes raise
// codes Nest 10 has never heard of (INVALID_FIELD_NAME, LIMIT_FIELD_NESTING,
// LIMIT_FIELD_ARRAY_INDEX, STREAM_DESTROYED). Whatever Nest does not map
// arrives here as a MulterError and is answered by its CODE, which multer
// keeps stable: a file over the limit 413, anything else 400 with multer's own
// message. Unfiltered, each one was a 500, logged as a fault of the server.
@Catch(multer.MulterError)
export class MulterErrorFilter implements ExceptionFilter {
  catch(error: multer.MulterError, host: ArgumentsHost): void {
    const http: HttpException =
      error.code === 'LIMIT_FILE_SIZE'
        ? new PayloadTooLargeException(error.message)
        : new BadRequestException(error.message);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(http.getStatus())
      .json(http.getResponse());
  }
}
