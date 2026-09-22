import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiServiceUnavailableResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { TranscriptionService } from '../ai/transcription.service';
import { TriageService } from '../ai/triage.service';
import { CasesService } from '../cases/cases.service';
import { escalationMinutes } from '../cases/notify.service';
import { SmsService } from '../common/sms.service';
import { Case } from '../entities/case.entity';
import { ResourcesService } from '../resources/resources.service';
import { RespondersService } from '../responders/responders.service';
import { VoiceService } from '../channels/voice/voice.service';
import { dashboardToken, DEMO_TOKEN, demoSignInEnabled } from '../config/env';
import { ActorDto, ListCasesQuery, RefParam, ResolveDto } from './api.dto';
import { TokenGuard } from './token.guard';

/** Never return encrypted fields or phone hashes from write endpoints. */
function summary(c: Case | null) {
  if (!c) throw new NotFoundException();
  return { ref: c.ref, status: c.status, urgency: c.urgency, acknowledgedBy: c.acknowledgedBy, acknowledgedAt: c.acknowledgedAt, updatedAt: c.updatedAt };
}

@ApiTags('console')
@Controller('api')
export class ApiController {
  constructor(
    private readonly cases: CasesService,
    private readonly sms: SmsService,
    private readonly resources: ResourcesService,
    private readonly responders: RespondersService,
    private readonly triage: TriageService,
    private readonly transcription: TranscriptionService,
    private readonly voice: VoiceService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /** Public liveness/readiness probe (Docker HEALTHCHECK, uptime monitors). Says nothing about configuration. */
  @Get('health') @SkipThrottle()
  @ApiOkResponse({ schema: { example: { ok: true } } }) @ApiServiceUnavailableResponse({ schema: { example: { ok: false } } })
  async health(@Res({ passthrough: true }) res: Response) {
    const ok = await this.db.query('SELECT 1').then(() => true, () => false);
    res.status(ok ? 200 : 503);
    return { ok };
  }

  /**
   * Public: may the console open without credentials? Outside production this hands out the console token, so the
   * PoC link opens straight into the console; with NODE_ENV=production it always answers no and the token stays secret.
   */
  @Get('demo-access') @SkipThrottle()
  @ApiOkResponse({ schema: { example: { demo: true, token: DEMO_TOKEN } } })
  demoAccess() {
    return demoSignInEnabled() ? { demo: true, token: dashboardToken() } : { demo: false };
  }

  /** Configuration and readiness for the console. Behind the token: it describes how the line is set up. */
  @UseGuards(TokenGuard) @Get('status')
  @ApiSecurity('dashboard-token') @ApiUnauthorizedResponse()
  async status() {
    const db = await this.db.query('SELECT 1').then(() => 'up', () => 'down');
    const voice = this.voice.readiness();
    const warnings = [
      ...(db === 'down' ? ['The database is not reachable.'] : []),
      ...(this.triage.provider === 'rules' ? ['No AI key: triage uses the offline rules only.'] : []),
      ...(this.transcription.provider === 'mock' ? ['No transcription provider: voice reports use labelled sample text (dev) or are marked untranscribed (production).'] : []),
      ...voice.warnings,
    ];
    return {
      ok: db === 'up',
      service: 'sauti-salama',
      db: `${process.env.DB_TYPE || 'sqljs'} (${db})`,
      ai: this.triage.provider,
      aiModel: this.triage.model,
      transcription: this.transcription.provider,
      transcriptionModel: this.transcription.model,
      sms: this.sms.mode,
      escalationMinutes: escalationMinutes(),
      retentionDays: Number(process.env.RETENTION_DAYS || 90),
      retentionOpenDays: Number(process.env.RETENTION_OPEN_DAYS ?? 365),
      erased: this.cases.erasedCount,
      voice: { counsellors: voice.counsellors, transcription: voice.transcription },
      warnings,
    };
  }

  @Get('resources') resourcesList() { return this.resources.all(); }

  @UseGuards(TokenGuard) @ApiSecurity('dashboard-token') @Get('responders') respondersList() { return this.responders.all(); }
  @UseGuards(TokenGuard) @ApiSecurity('dashboard-token') @Get('outbox') outbox() { return this.sms.view(100); }
  @UseGuards(TokenGuard) @ApiSecurity('dashboard-token') @Get('cases') list(@Query() q: ListCasesQuery) { return this.cases.list(q.limit || 100); }

  @UseGuards(TokenGuard) @ApiSecurity('dashboard-token') @Get('cases/:ref')
  async detail(@Param() { ref }: RefParam, @Query() q: ActorDto) {
    const d = await this.cases.detail(ref, q.actor || 'console');
    if (!d) throw new NotFoundException();
    return d;
  }

  @UseGuards(TokenGuard) @ApiSecurity('dashboard-token') @Post('cases/:ref/ack') @HttpCode(201)
  async ack(@Param() { ref }: RefParam, @Body() body: ActorDto) { return summary(await this.cases.acknowledge(ref, body.actor || 'console')); }

  @UseGuards(TokenGuard) @ApiSecurity('dashboard-token') @Post('cases/:ref/resolve') @HttpCode(201)
  async resolve(@Param() { ref }: RefParam, @Body() body: ResolveDto) {
    return summary(await this.cases.resolve(ref, body.actor || 'console', body.outcome || 'RESOLVED', body.note));
  }

  @UseGuards(TokenGuard) @ApiSecurity('dashboard-token') @Post('cases/:ref/reveal-contact') @HttpCode(201)
  async reveal(@Param() { ref }: RefParam, @Body() body: ActorDto) {
    const r = await this.cases.revealContact(ref, body.actor || 'console');
    if (!r) throw new NotFoundException();
    return r;
  }

  @UseGuards(TokenGuard) @ApiSecurity('dashboard-token') @Delete('cases/:ref')
  async erase(@Param() { ref }: RefParam, @Query() q: ActorDto) {
    return { erased: await this.cases.erase(ref, { actor: q.actor || 'console' }) };
  }
}
