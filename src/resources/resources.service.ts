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

  /** Best entry for a category: local match first, then a verified national one. */
  pick(category: string, coverage?: string): Resource | undefined {
    const c = this.cache.filter((r) => r.category === category);
    if (coverage) {
      const local = c.find((r) => r.coverage.toLowerCase() === String(coverage).toLowerCase());
      if (local) return local;
    }
    return c.find((r) => r.coverage === 'national' && r.verified) || c.find((r) => r.coverage === 'national') || c[0];
  }
}
