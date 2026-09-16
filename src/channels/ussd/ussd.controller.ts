import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { WebhookGuard } from '../webhook.guard';
import { UssdService } from './ussd.service';

/** Africa's Talking USSD callback: POST { sessionId, serviceCode, phoneNumber, text } -> "CON ..." | "END ..." */
@Controller('webhooks/ussd')
@UseGuards(WebhookGuard)
export class UssdController {
  constructor(private readonly ussd: UssdService) {}

  @Post() @HttpCode(200) @Header('Content-Type', 'text/plain; charset=utf-8')
  handle(@Body() body: Record<string, string>) { return this.ussd.handle(body); }
}
