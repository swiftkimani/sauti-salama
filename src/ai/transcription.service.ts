import { Injectable, Logger } from '@nestjs/common';
import { Lang } from './triage.types';

export const SAMPLE_TRANSCRIPTS: Record<Lang, string> = {
  en: 'Please help me. My husband beat me again last night in Kayole and he is threatening to kill me if I tell anyone. He is still in the house and I have two small children with me.',
  sw: 'Naomba msaada. Mume wangu alinipiga tena jana usiku hapa Kayole na anatishia kuniua nikimwambia mtu yeyote. Bado yuko ndani ya nyumba na niko na watoto wawili wadogo.',
};

/** Whisper models transcribe Kiswahili, English and Sheng; a short prompt helps with Kenyan place names. */
const WHISPER_PROMPT = 'Ripoti ya dhuluma kutoka Kenya. Report from Kenya in Kiswahili, English or Sheng. Places: Kayole, Kibra, Dandora, Umoja, Githurai, Mathare, Mukuru, Kawangware.';

/**
 * Speech-to-text for voice-line recordings: Groq Whisper (default when GROQ_API_KEY is set) or OpenAI Whisper.
 * Without a key (or in the simulator) a provided transcript / sample text is used so the
 * rest of the pipeline can be demonstrated end to end.
 */
@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  get provider(): string {
    const p = (process.env.TRANSCRIBE_PROVIDER || '').toLowerCase();
    if (p) return p;
    if (process.env.GROQ_API_KEY) return 'groq';
    return process.env.OPENAI_API_KEY ? 'openai' : 'mock';
  }

  get model(): string | null {
    if (this.provider === 'groq') return process.env.GROQ_TRANSCRIBE_MODEL || 'whisper-large-v3';
    if (this.provider === 'openai') return process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
    return null;
  }

  async transcribe(recordingUrl: string, opts: { language?: Lang; mockTranscript?: string }): Promise<{ text: string; provider: string }> {
    if (opts.mockTranscript && process.env.NODE_ENV !== 'production') {
      return { text: opts.mockTranscript.slice(0, 6000), provider: 'simulator' };
    }
    const provider = this.provider;
    if (['groq', 'openai'].includes(provider) && recordingUrl && /^https?:\/\//.test(recordingUrl)) {
      try {
        return { text: await this.whisper(recordingUrl, provider, opts.language), provider: `${provider}-whisper` };
      } catch (e) {
        this.logger.warn(`Transcription failed (${(e as Error)?.message || e}); using sample transcript`);
      }
    }
    return { text: SAMPLE_TRANSCRIPTS[opts.language || 'en'], provider: 'mock' };
  }

  private async whisper(recordingUrl: string, provider: string, language?: Lang): Promise<string> {
    const groq = provider === 'groq';
    const key = groq ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;
    if (!key) throw new Error(`${groq ? 'GROQ_API_KEY' : 'OPENAI_API_KEY'} is not set`);
    const audio = await fetch(recordingUrl);
    if (!audio.ok) throw new Error(`Could not download recording (${audio.status})`);
    const blob = await audio.blob();
    const form = new FormData();
    form.append('file', blob, 'recording.mp3');
    form.append('model', this.model);
    form.append('prompt', WHISPER_PROMPT);
    form.append('response_format', 'json');
    if (language) form.append('language', language);
    const endpoint = groq ? 'https://api.groq.com/openai/v1/audio/transcriptions' : 'https://api.openai.com/v1/audio/transcriptions';
    const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
    if (!res.ok) throw new Error(`${groq ? 'Groq' : 'OpenAI'} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data: any = await res.json();
    return String(data.text || '').trim();
  }
}
