import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { Case } from '../entities/case.entity';
import { CaseEventsService } from './case-events.service';

/** Storage limitation: closed cases are purged after RETENTION_DAYS (default 90). */
@Injectable()
export class RetentionService implements OnModuleInit {
  private readonly logger = new Logger(RetentionService.name);

  constructor(@InjectRepository(Case) private readonly cases: Repository<Case>, private readonly events: CaseEventsService) {}

  async onModuleInit() {
    await this.purge().catch((e) => this.logger.error(`purge failed: ${e}`));
    const t = setInterval(() => this.purge().catch((e) => this.logger.error(`purge failed: ${e}`)), 24 * 60 * 60 * 1000);
    t.unref?.();
  }

  async purge(): Promise<number> {
    const days = Number(process.env.RETENTION_DAYS || 90);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const old = await this.cases.find({ where: { status: In(['RESOLVED', 'FALSE_ALARM']), updatedAt: LessThan(cutoff) } });
    for (const c of old) {
      await this.events.deleteForCase(c.id);
      await this.cases.delete({ id: c.id });
    }
    if (old.length) this.logger.log(`Retention: purged ${old.length} closed case(s) older than ${days} days`);
    return old.length;
  }
}
