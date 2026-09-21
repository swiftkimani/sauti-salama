import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from '../entities/resource.entity';
import { SEED_RESOURCES } from './seed';

@Injectable()
export class ResourcesService implements OnModuleInit {
  private readonly logger = new Logger(ResourcesService.name);
  private cache: Resource[] = [];

  constructor(@InjectRepository(Resource) private readonly repo: Repository<Resource>) {}

  async onModuleInit() {
    if ((await this.repo.count()) === 0) {
      await this.repo.save(SEED_RESOURCES.map((r) => this.repo.create(r)));
      this.logger.log(`Seeded ${SEED_RESOURCES.length} support-directory entries`);
    }
    this.cache = await this.repo.find();
  }

  all(): Resource[] { return this.cache; }

  /**
   * Best entry for a category, verified only: a number nobody has confirmed must never reach a
   * survivor as though it had been. A category with nothing verified falls back to the national
   * helpline - free, 24/7, and able to refer onwards - rather than to an unchecked number.
   */
  pick(category: string, coverage?: string): Resource | undefined {
    const c = this.cache.filter((r) => r.category === category && r.verified);
    if (coverage) {
      const local = c.find((r) => r.coverage.toLowerCase() === String(coverage).toLowerCase());
      if (local) return local;
    }
    return c.find((r) => r.coverage === 'national') || c[0] || this.helpline();
  }

  /** The one entry every other category can fall back to. */
  private helpline(): Resource | undefined {
    return this.cache.find((r) => r.category === 'helpline' && r.verified && r.coverage === 'national');
  }
}
