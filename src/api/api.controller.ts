import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TranscriptionService } from '../ai/transcription.service';
import { TriageService } from '../ai/triage.service';
import { CasesService } from '../cases/cases.service';
import { SmsService } from '../common/sms.service';
import { Case } from '../entities/case.entity';
import { ResourcesService } from '../resources/resources.service';
import { RespondersService } from '../responders/responders.service';
import { TokenGuard } from './token.guard';

/** Never return encrypted fields or phone hashes from write endpoints. */
function summary(c: Case | null) {
  if (!c) throw new NotFoundException();
  return { ref: c.ref, status: c.status, urgency: c.urgency, acknowledgedBy: c.acknowledgedBy, acknowledgedAt: c.acknowledgedAt, updatedAt: c.updatedAt };
}

@Controller('api')
export class ApiController {
  constructor(
    private readonly cases: CasesService,
    private readonly sms: SmsService,
    private readonly resources: ResourcesService,
    private readonly responders: RespondersService,
    private readonly triage: TriageService,
    private readonly transcription: TranscriptionService,
  ) {}

  @Get('health')
  health() {
    return {
      ok: true,
      service: 'sauti-salama',
      db: process.env.DB_TYPE || 'sqljs',
      ai: this.triage.provider,
      aiModel: this.triage.model,
      transcription: this.transcription.provider,
      transcriptionModel: this.transcription.model,
      sms: this.sms.mode,
      escalationMinutes: Number(process.env.ESCALATION_MINUTES ?? 10),
      retentionDays: Number(process.env.RETENTION_DAYS || 90),
      erased: this.cases.erasedCount,
    };
  }

  @Get('resources') resourcesList() { return this.resources.all(); }

  @UseGuards(TokenGuard) @Get('responders') respondersList() { return this.responders.all(); }
  @UseGuards(TokenGuard) @Get('outbox') outbox() { return this.sms.outbox.slice(0, 100); }
  @UseGuards(TokenGuard) @Get('cases') list(@Query('limit') limit?: string) { return this.cases.list(Number(limit) || 100); }

  @UseGuards(TokenGuard) @Get('cases/:ref')
  async detail(@Param('ref') ref: string, @Query('actor') actor?: string) {
    const d = await this.cases.detail(ref.toUpperCase(), actor || 'console');
    if (!d) throw new NotFoundException();
    return d;
  }

  @UseGuards(TokenGuard) @Post('cases/:ref/ack')
  async ack(@Param('ref') ref: string, @Body() body: { actor?: string }) { return summary(await this.cases.acknowledge(ref.toUpperCase(), body?.actor || 'console')); }

  @UseGuards(TokenGuard) @Post('cases/:ref/resolve')
  async resolve(@Param('ref') ref: string, @Body() body: { actor?: string; outcome?: 'RESOLVED' | 'FALSE_ALARM'; note?: string }) {
    return summary(await this.cases.resolve(ref.toUpperCase(), body?.actor || 'console', body?.outcome || 'RESOLVED', body?.note));
  }

  @UseGuards(TokenGuard) @Post('cases/:ref/reveal-contact')
  reveal(@Param('ref') ref: string, @Body() body: { actor?: string }) { return this.cases.revealContact(ref.toUpperCase(), body?.actor || 'console'); }

  @UseGuards(TokenGuard) @Delete('cases/:ref')
  async erase(@Param('ref') ref: string, @Query('actor') actor?: string) {
    return { erased: await this.cases.erase(ref.toUpperCase(), { actor: actor || 'console' }) };
  }
}
