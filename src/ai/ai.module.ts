import { Global, Module } from '@nestjs/common';
import { TranscriptionService } from './transcription.service';
import { TriageService } from './triage.service';

@Global()
@Module({ providers: [TriageService, TranscriptionService], exports: [TriageService, TranscriptionService] })
export class AiModule {}
