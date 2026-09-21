import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { ApiController } from './api.controller';

@Module({ imports: [ChannelsModule], controllers: [ApiController] })
export class ApiModule {}
