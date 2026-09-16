import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Responder } from '../entities/responder.entity';

/**
 * Vetted responder registry ("vouched circle"). Tier 1 = community responders who can reach
 * a survivor within minutes (community health promoters, peace-committee members, trained
 * volunteers from GBV organisations). Tier 2 = institutional desk that takes over when
 * nobody in Tier 1 acknowledges. State security is a survivor's choice, never the default.
 * Demo seed uses fictional people; every phone points at DEMO_RESPONDER_PHONE.
 */
@Injectable()
export class RespondersService implements OnModuleInit {
  private readonly logger = new Logger(RespondersService.name);
  private cache: Responder[] = [];

  constructor(@InjectRepository(Responder) private readonly repo: Repository<Responder>) {}

  async onModuleInit() {
    const demo = process.env.DEMO_RESPONDER_PHONE || '+254700000000';
    const tier2 = process.env.TIER2_RESPONDER_PHONE || demo;
    if ((await this.repo.count()) === 0) {
      await this.repo.save([
        this.repo.create({ name: 'Amina W. (Community Health Promoter)', organisation: 'Kayole Community Response Team', phone: demo, tier: 1, wards: ['Kayole', 'Kayole North', 'Kayole Central', 'Komarock'], languages: ['sw', 'en'], verifiedBy: 'Sub-county GBV working group (demo)' }),
        this.repo.create({ name: 'John K. (Peace Committee / Nyumba Kumi)', organisation: 'Dandora Peace Committee', phone: demo, tier: 1, wards: ['Dandora', 'Dandora Area I', 'Dandora Area II'], languages: ['sw', 'en'], verifiedBy: 'Sub-county GBV working group (demo)' }),
        this.repo.create({ name: 'Grace M. (Survivor-support volunteer)', organisation: 'Community GBV network, Kibra', phone: demo, tier: 1, wards: ['Kibra', 'Laini Saba', 'Makina', 'Lindi'], languages: ['sw', 'en'], verifiedBy: 'Partner organisation (demo)' }),
        this.repo.create({ name: 'Duty Tier-1 responder (any area)', organisation: 'Sauti Salama duty roster', phone: demo, tier: 1, wards: ['*'], languages: ['sw', 'en'], verifiedBy: 'Sauti Salama (demo)' }),
        this.repo.create({ name: 'GBV Recovery Centre desk (Tier 2)', organisation: 'Institutional escalation desk', phone: tier2, tier: 2, wards: ['*'], languages: ['sw', 'en'], verifiedBy: 'Partner MoU (demo)' }),
      ]);
      this.logger.log('Seeded demo responders (all alerts go to DEMO_RESPONDER_PHONE)');
    }
    this.cache = await this.repo.find();
  }

  all(): Responder[] { return this.cache; }

  forWard(ward: string | null | undefined, tier: number): Responder[] {
    const active = this.cache.filter((r) => r.active && r.tier === tier);
    const w = (ward || '').trim().toLowerCase();
    const local = w
      ? active.filter((r) => r.wards.some((x) => x !== '*' && (w.includes(x.toLowerCase()) || x.toLowerCase().includes(w))))
      : [];
    if (local.length) return local;
    return active.filter((r) => r.wards.includes('*'));
  }
}
