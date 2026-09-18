import { Global, Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { TranscriptionService } from './transcription.service';
import { TriageService } from './triage.service';

@Global()
@Module({ providers: [TriageService, TranscriptionService, ConversationService], exports: [TriageService, TranscriptionService, ConversationService] })
export class AiModule {}
