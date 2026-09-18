import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request, Response } from 'express';
import { response, say } from '../channels/voice/xml';
import { CALL } from '../i18n/call';
import { USSD } from '../i18n/messages';

/**
 * Client errors (4xx) keep Nest's normal JSON. Unexpected failures are logged once, answered with a generic
 * message (no internals), and on the USSD and voice webhooks turned into something a survivor can act on:
 * Africa's Talking only shows a reply to a 200, and a silent failure mid-report would leave the caller with nothing.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Unhandled');

  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status < 500 || host.getType() !== 'http') return super.catch(exception, host);
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    this.logger.error(`${req.method} ${req.path} failed: ${exception instanceof Error ? exception.stack : String(exception)}`);
    if (res.headersSent) return;
    if (req.path.startsWith('/webhooks/ussd')) {
      res.status(200).type('text/plain').send(USSD.failure);
    } else if (req.path.startsWith('/webhooks/voice')) {
      res.status(200).type('application/xml').send(response(say(CALL.failure.en), say(CALL.failure.sw)));
    } else {
      res.status(status).json({ statusCode: status, message: 'Internal server error' });
    }
  }
}
