import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './config/database';
import { CommonModule } from './common/common.module';
import { ResourcesModule } from './resources/resources.module';
import { AiModule } from './ai/ai.module';
import { CasesModule } from './cases/cases.module';
import { ChannelsModule } from './channels/channels.module';
import { ApiModule } from './api/api.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(buildTypeOrmOptions()),
    CommonModule,
    ResourcesModule,
    AiModule,
    CasesModule,
    ChannelsModule,
    ApiModule,
  ],
})
export class AppModule {}
