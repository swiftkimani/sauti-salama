import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Not, Repository } from 'typeorm';
import { Case } from '../entities/case.entity';
import { CLOSED, deleteCase } from './cases.service';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Storage limitation (Kenya DPA 2019 s.25):
 *  - closed cases are purged RETENTION_DAYS (default 90) after their last update;
 *  - cases never closed (open, escalated, acknowledged but not resolved) are purged after RETENTION_OPEN_DAYS
 *    (default 365) without any update, so an abandoned report is not kept forever. 0 keeps them indefinitely.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(@InjectRepository(Case) private readonly cases: Repository<Case>) {}

  async onModuleInit() {
    await this.purge().catch((e) => this.logger.error(`purge failed: ${e}`));
    this.timer = setInterval(() => this.purge().catch((e) => this.logger.error(`purge failed: ${e}`)), DAY);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async purge(now = Date.now()): Promise<{ closed: number; stale: number }> {
    const days = Number(process.env.RETENTION_DAYS || 90);
    const openDays = Number(process.env.RETENTION_OPEN_DAYS ?? 365);
    const closed = await this.cases.find({ select: { id: true }, where: { status: In(CLOSED), updatedAt: LessThan(new Date(now - days * DAY)) } });
    const stale = openDays > 0
      ? await this.cases.find({ select: { id: true }, where: { status: Not(In(CLOSED)), updatedAt: LessThan(new Date(now - openDays * DAY)) } })
      : [];
    for (const { id } of [...closed, ...stale]) await deleteCase(this.cases, id);
    if (closed.length) this.logger.log(`Retention: purged ${closed.length} closed case(s) older than ${days} days`);
    if (stale.length) this.logger.warn(`Retention: purged ${stale.length} never-closed case(s) with no update for ${openDays} days`);
    return { closed: closed.length, stale: stale.length };
  }
}
