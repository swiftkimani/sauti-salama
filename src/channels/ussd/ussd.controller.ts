import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WebhookThrottle } from '../webhook-throttle';
import { UssdCallbackDto } from '../webhook.dto';
import { WebhookGuard } from '../webhook.guard';
import { UssdService } from './ussd.service';

/** Africa's Talking USSD callback: POST { sessionId, serviceCode, phoneNumber, text } -> "CON ..." | "END ..." */
@ApiTags('webhooks')
@ApiQuery({ name: 'key', required: false, description: 'WEBHOOK_SECRET' })
@Controller('webhooks/ussd')
@UseGuards(WebhookGuard)
@WebhookThrottle()
export class UssdController {
  constructor(private readonly ussd: UssdService) {}

  @Post() @HttpCode(200) @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiProduces('text/plain') @ApiOkResponse({ schema: { type: 'string', example: 'CON Sauti Salama\n1. English\n2. Kiswahili' } })
  handle(@Body() body: UssdCallbackDto) { return this.ussd.handle(body); }
}
