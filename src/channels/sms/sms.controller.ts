import { Body, Controller, HttpCode, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SmsService } from '../../common/sms.service';
import { WebhookThrottle } from '../webhook-throttle';
import { SmsDeliveryDto, SmsInboundDto } from '../webhook.dto';
import { WebhookGuard } from '../webhook.guard';
import { SmsInboundService } from './sms-inbound.service';

/** Africa's Talking inbound SMS callback: POST { from, to, text, date, id, linkId } */
@ApiTags('webhooks')
@ApiQuery({ name: 'key', required: false, description: 'WEBHOOK_SECRET' })
@Controller('webhooks/sms')
@UseGuards(WebhookGuard)
@WebhookThrottle()
export class SmsController {
  private readonly logger = new Logger(SmsController.name);

  constructor(private readonly inbound: SmsInboundService, private readonly sms: SmsService) {}

  /** Acknowledge at once: AI triage can take several seconds and the gateway should not wait for it. */
  @Post() @HttpCode(200) @ApiOkResponse({ schema: { example: { ok: true } } })
  handle(@Body() body: SmsInboundDto) {
    this.inbound.handle(body).catch((e) => this.logger.error(`Inbound SMS ${body?.id || ''} failed: ${e}`));
    return { ok: true };
  }

  /** Delivery reports: set this as the "Delivery reports" callback URL on the Africa's Talking dashboard. */
  @Post('delivery') @HttpCode(200) @ApiOkResponse({ schema: { example: { ok: true, matched: true } } })
  delivery(@Body() body: SmsDeliveryDto) {
    return { ok: true, matched: this.sms.markDelivery(body) };
  }
}
