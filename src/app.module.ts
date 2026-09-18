import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildTypeOrmOptions } from './config/database';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { CommonModule } from './common/common.module';
import { ResourcesModule } from './resources/resources.module';
import { AiModule } from './ai/ai.module';
import { CasesModule } from './cases/cases.module';
import { ChannelsModule } from './channels/channels.module';
import { ApiModule } from './api/api.module';

@Module({
  imports: [
    // Tests never read .env: a developer's real Africa's Talking or AI keys must not be used by a test run.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === 'test' }),
    TypeOrmModule.forRoot(buildTypeOrmOptions()),
    // Per client IP. The console API default; the webhooks override it (see channels/webhook-throttle.ts).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60 * 1000, limit: () => Number(process.env.API_RATE_LIMIT_PER_MINUTE ?? 300) }]),
    CommonModule,
    ResourcesModule,
    AiModule,
    CasesModule,
    ChannelsModule,
    ApiModule,
  ],
  providers: [
    // Every body, query and route parameter is checked against its DTO; unknown fields are dropped.
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, transform: true }) },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
