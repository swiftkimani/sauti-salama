import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Case } from '../entities/case.entity';
import { CaseEvent } from '../entities/case-event.entity';
import { Responder } from '../entities/responder.entity';
import { RespondersService } from '../responders/responders.service';
import { CaseEventsService } from './case-events.service';
import { CasesService } from './cases.service';
import { NotifyService } from './notify.service';
import { ReferralService } from './referral.service';
import { RetentionService } from './retention.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Case, CaseEvent, Responder])],
  providers: [CasesService, CaseEventsService, NotifyService, ReferralService, RetentionService, RespondersService],
  exports: [CasesService, CaseEventsService, NotifyService, ReferralService, RespondersService],
})
export class CasesModule {}
