import { Body, Controller, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import { SmsService } from '../../common/sms.service';
import { WebhookGuard } from '../webhook.guard';
import { SmsInboundService } from './sms-inbound.service';

/** Africa's Talking inbound SMS callback: POST { from, to, text, date, id, linkId } */
@Controller('webhooks/sms')
@UseGuards(WebhookGuard)
export class SmsController {
  private readonly logger = new Logger(SmsController.name);

  constructor(private readonly inbound: SmsInboundService, private readonly sms: SmsService) {}

  /** Acknowledge at once: AI triage can take several seconds and the gateway should not wait for it. */
  @Post() @HttpCode(200)
  handle(@Body() body: Record<string, string>) {
    this.inbound.handle(body).catch((e) => this.logger.error(`Inbound SMS ${body?.id || ''} failed: ${e}`));
    return { ok: true };
  }

  /** Delivery reports: set this as the "Delivery reports" callback URL on the Africa's Talking dashboard. */
  @Post('delivery') @HttpCode(200)
  delivery(@Body() body: Record<string, string>) {
    return { ok: true, matched: this.sms.markDelivery(body || {}) };
  }
}
