import { Module } from '@nestjs/common';
import { SmsInboundService } from './sms/sms-inbound.service';
import { SmsController } from './sms/sms.controller';
import { UssdController } from './ussd/ussd.controller';
import { UssdService } from './ussd/ussd.service';
import { VoiceController } from './voice/voice.controller';
import { VoiceService } from './voice/voice.service';

@Module({
  controllers: [VoiceController, UssdController, SmsController],
  providers: [VoiceService, UssdService, SmsInboundService],
})
export class ChannelsModule {}
