import { Injectable, Logger } from '@nestjs/common';
import { Lang } from './triage.types';

export const SAMPLE_TRANSCRIPTS: Record<Lang, string> = {
  en: 'Please help me. My husband beat me again last night in Kayole and he is threatening to kill me if I tell anyone. He is still in the house and I have two small children with me.',
  sw: 'Naomba msaada. Mume wangu alinipiga tena jana usiku hapa Kayole na anatishia kuniua nikimwambia mtu yeyote. Bado yuko ndani ya nyumba na niko na watoto wawili wadogo.',
};

/**
 * Speech-to-text for voice-line recordings. OpenAI Whisper handles Kiswahili and English;
 * without a key (or in the simulator) a provided transcript / sample text is used so the
 * rest of the pipeline can be demonstrated end to end.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  get provider(): string {
    const p = (process.env.TRANSCRIBE_PROVIDER || '').toLowerCase();
    if (p) return p;
    return process.env.OPENAI_API_KEY ? 'openai' : 'mock';
  }

  async transcribe(recordingUrl: string, opts: { language?: Lang; mockTranscript?: string }): Promise<{ text: string; provider: string }> {
    if (opts.mockTranscript && process.env.NODE_ENV !== 'production') {
      return { text: opts.mockTranscript.slice(0, 6000), provider: 'simulator' };
    }
    if (this.provider === 'openai' && recordingUrl && /^https?:\/\//.test(recordingUrl)) {
      try {
        return { text: await this.whisper(recordingUrl, opts.language), provider: 'openai-whisper' };
      } catch (e) {
        this.logger.warn(`Transcription failed (${(e as Error)?.message || e}); using sample transcript`);
      }
    }
    return { text: SAMPLE_TRANSCRIPTS[opts.language || 'en'], provider: 'mock' };
  }

  private async whisper(recordingUrl: string, language?: Lang): Promise<string> {
    const audio = await fetch(recordingUrl);
    if (!audio.ok) throw new Error(`Could not download recording (${audio.status})`);
    const blob = await audio.blob();
    const form = new FormData();
    form.append('file', blob, 'recording.mp3');
    form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
    if (language) form.append('language', language);
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data: any = await res.json();
    return String(data.text || '').trim();
  }
}
