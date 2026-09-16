import { Body, Controller, Header, Post, UseGuards } from '@nestjs/common';
import { WebhookGuard } from '../webhook.guard';
import { VoiceService } from './voice.service';

/**
 * Africa's Talking Voice callbacks. Set the sandbox/live voice callback URL to
 * `${PUBLIC_BASE_URL}/webhooks/voice`; every later step carries its own callbackUrl.
 */
@Controller('webhooks/voice')
@UseGuards(WebhookGuard)
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Post() @Header('Content-Type', 'application/xml')
  entry(@Body() body: Record<string, string>) { return this.voice.entry(body); }

  @Post('lang') @Header('Content-Type', 'application/xml')
  lang(@Body() body: Record<string, string>) { return this.voice.language(body); }

  @Post('menu') @Header('Content-Type', 'application/xml')
  menu(@Body() body: Record<string, string>) { return this.voice.menuChoice(body); }

  @Post('info') @Header('Content-Type', 'application/xml')
  info(@Body() body: Record<string, string>) { return this.voice.infoChoice(body); }

  @Post('recording') @Header('Content-Type', 'application/xml')
  recording(@Body() body: Record<string, string>) { return this.voice.recording(body); }

  @Post('consent') @Header('Content-Type', 'application/xml')
  consent(@Body() body: Record<string, string>) { return this.voice.consent(body); }

  /** Optional "call ended" event URL (isActive=0). */
  @Post('events') @Header('Content-Type', 'text/plain')
  events(@Body() body: Record<string, string>) { this.voice.entry({ ...body, isActive: '0' }); return 'ok'; }
}
