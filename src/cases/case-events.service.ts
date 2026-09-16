import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaseEvent } from '../entities/case-event.entity';

@Injectable()
export class CaseEventsService {
  constructor(@InjectRepository(CaseEvent) private readonly repo: Repository<CaseEvent>) {}

  add(caseId: string, type: string, actor: string, detail?: string): Promise<CaseEvent> {
    return this.repo.save(this.repo.create({ caseId, type, actor, detail: detail ? String(detail).slice(0, 1000) : null }));
  }

  list(caseId: string): Promise<CaseEvent[]> {
    return this.repo.find({ where: { caseId }, order: { createdAt: 'ASC' } });
  }

  async deleteForCase(caseId: string): Promise<void> {
    await this.repo.delete({ caseId });
  }
}
