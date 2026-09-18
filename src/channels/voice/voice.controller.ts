import { Body, Controller, Header, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WebhookThrottle } from '../webhook-throttle';
import { VoiceCallbackDto } from '../webhook.dto';
import { WebhookGuard } from '../webhook.guard';
import { VoiceService } from './voice.service';

/**
 * Africa's Talking Voice callbacks. Set the voice callback URL to `${PUBLIC_BASE_URL}/webhooks/voice`;
 * every answer the caller gives comes back to /webhooks/voice/turn, whose URL is in the XML we return.
 */
@ApiTags('webhooks')
@ApiQuery({ name: 'key', required: false, description: 'WEBHOOK_SECRET' })
@ApiProduces('application/xml')
@Controller('webhooks/voice')
@UseGuards(WebhookGuard)
@WebhookThrottle()
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /** The call connects, and again when a counsellor dial ends. */
  @Post() @HttpCode(200) @Header('Content-Type', 'application/xml')
  entry(@Body() body: VoiceCallbackDto) { return this.voice.entry(body); }

  /** One answer from the caller (Africa's Talking posts the recording of what they just said). */
  @Post('turn') @HttpCode(200) @Header('Content-Type', 'application/xml')
  turn(@Body() body: VoiceCallbackDto) { return this.voice.turn(body); }

  /** Optional "call ended" event URL (isActive=0). */
  @Post('events') @HttpCode(200) @Header('Content-Type', 'text/plain')
  events(@Body() body: VoiceCallbackDto) { this.voice.entry({ ...body, isActive: '0' }); return 'ok'; }
}
