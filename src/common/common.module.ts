import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { SmsService } from './sms.service';

@Global()
@Module({ providers: [CryptoService, SmsService], exports: [CryptoService, SmsService] })
export class CommonModule {}
