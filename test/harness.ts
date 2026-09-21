import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { AiModule } from '../src/ai/ai.module';
import { CasesModule } from '../src/cases/cases.module';
import { ChannelsModule } from '../src/channels/channels.module';
import { CommonModule } from '../src/common/common.module';
import { OutboxMessage, SmsService } from '../src/common/sms.service';
import { Case, CaseEvent, entities } from '../src/entities';
import { ResourcesModule } from '../src/resources/resources.module';

/** Seeded demo responders: every Tier-1 alert goes to TIER1, every Tier-2 alert to TIER2. */
export const TIER1 = '+254700000001';
export const TIER2 = '+254700000002';
export const SURVIVOR = '+254712345678';

/** Records messages instead of sending them. Numbers in `failing` are refused the way Africa's Talking refuses them. */
export class FakeSms extends SmsService {
  readonly failing = new Set<string>();

  async send(to: string, message: string, kind: OutboxMessage['kind'] = 'system'): Promise<OutboxMessage> {
    const failed = this.failing.has(to);
    const m: OutboxMessage = { id: randomUUID(), to, message, kind, at: new Date().toISOString(), mode: 'sandbox', status: failed ? 'failed' : 'sent', failureReason: failed ? 'InsufficientBalance' : undefined };
    this.outbox.unshift(m);
    return m;
  }

  sentTo(phone: string): OutboxMessage[] { return this.outbox.filter((m) => m.to === phone && m.status === 'sent'); }
}

export interface Harness {
  app: INestApplication;
  sms: FakeSms;
  cases: Repository<Case>;
  events: Repository<CaseEvent>;
  close(): Promise<void>;
}

/** The real services on an in-memory database, with the SMS gateway faked. */
export async function buildHarness(): Promise<Harness> {
  process.env.DEMO_RESPONDER_PHONE = TIER1;
  process.env.TIER2_RESPONDER_PHONE = TIER2;
  const moduleRef = await Test.createTestingModule({
    imports: [TypeOrmModule.forRoot({ type: 'sqljs', entities, synchronize: true, logging: false }), CommonModule, ResourcesModule, AiModule, CasesModule, ChannelsModule],
  }).overrideProvider(SmsService).useClass(FakeSms).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return {
    app,
    sms: app.get(SmsService) as FakeSms,
    cases: app.get(getRepositoryToken(Case)),
    events: app.get(getRepositoryToken(CaseEvent)),
    close: () => app.close(),
  };
}

export async function eventsOf(h: Harness, caseId: string): Promise<CaseEvent[]> {
  return h.events.find({ where: { caseId }, order: { createdAt: 'ASC' } });
}

/** Waits for background work (responder notification is fire-and-forget) to produce a truthy result. */
export async function eventually<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 3000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('condition not met in time');
    await new Promise((r) => setTimeout(r, 20));
  }
}

export const minutes = (n: number) => n * 60 * 1000;
