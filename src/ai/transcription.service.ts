import { Injectable } from '@nestjs/common';
import { isIP } from 'net';
import { isProduction } from '../config/env';
import { aiBudget } from './ai-budget';
import { Lang } from './triage.types';

export const SAMPLE_TRANSCRIPTS: Record<Lang, string> = {
  en: 'Please help me. My husband beat me again last night in Kayole and he is threatening to kill me if I tell anyone. He is still in the house and I have two small children with me.',
  sw: 'Naomba msaada. Mume wangu alinipiga tena jana usiku hapa Kayole na anatishia kuniua nikimwambia mtu yeyote. Bado yuko ndani ya nyumba na niko na watoto wawili wadogo.',
};

/** Marks sample text so nobody mistakes it for what a caller said. */
export const SAMPLE_LABEL = '[SAMPLE TEXT: no transcription provider is configured; this is not what the caller said]';

/** Whisper models transcribe Kiswahili, English and Sheng; a short prompt helps with Kenyan place names. */
const WHISPER_PROMPT = 'Ripoti ya dhuluma kutoka Kenya. Report from Kenya in Kiswahili, English or Sheng. Places: Kayole, Kibra, Dandora, Umoja, Githurai, Mathare, Mukuru, Kawangware.';

/** Groq's and OpenAI's upload limit for a single audio file. */
const MAX_RECORDING_BYTES = 25 * 1024 * 1024;

/**
 * The recording URL arrives in a webhook body, so it is attacker-controlled if the webhook secret ever leaks.
 * Only https downloads from allow-listed hosts (RECORDING_URL_HOSTS, a host matches itself and its subdomains)
 * are fetched: no IP literals, no credentials, no other ports, no redirects.
 */
export function checkRecordingUrl(raw: string, hosts = recordingHosts()): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('the recording URL is not a valid URL');
  }
  if (u.protocol !== 'https:') throw new Error('the recording URL must use https');
  if (u.username || u.password) throw new Error('the recording URL must not carry credentials');
  if (u.port && u.port !== '443') throw new Error('the recording URL must use the default https port');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (isIP(host) || host.startsWith('[')) throw new Error('the recording URL must use a host name, not an IP address');
  if (!hosts.some((h) => host === h || host.endsWith(`.${h}`))) throw new Error(`recording host ${host} is not in RECORDING_URL_HOSTS`);
  return u;
}

export const recordingHosts = () =>
  (process.env.RECORDING_URL_HOSTS || 'africastalking.com').split(',').map((h) => h.trim().toLowerCase().replace(/^\*?\./, '')).filter(Boolean);

/**
 * Speech-to-text for voice-line recordings: Groq Whisper (default when GROQ_API_KEY is set) or OpenAI Whisper.
 * transcribe() throws when a recording cannot be turned into text; the caller then handles the report as
 * untranscribed. It never substitutes other words for what a survivor said. Sample text is only used outside
 * production when no provider is configured, and is labelled as such.
 */
@Injectable()
export class TranscriptionService {
  get provider(): string {
    const p = (process.env.TRANSCRIBE_PROVIDER || '').toLowerCase();
    if (p) return p;
    if (process.env.GROQ_API_KEY) return 'groq';
    return process.env.OPENAI_API_KEY ? 'openai' : 'mock';
  }

  /** False when no speech-to-text is configured: the call line cannot hold a conversation without it. */
  get available(): boolean { return this.provider !== 'mock'; }

  get model(): string | null {
    if (this.provider === 'groq') return process.env.GROQ_TRANSCRIBE_MODEL || 'whisper-large-v3';
    if (this.provider === 'openai') return process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
    return null;
  }

  async transcribe(recordingUrl: string, opts: { language?: Lang; mockTranscript?: string }): Promise<{ text: string; provider: string }> {
    if (opts.mockTranscript && !isProduction()) {
      return { text: opts.mockTranscript.slice(0, 6000), provider: 'simulator' };
    }
    const provider = this.provider;
    if (provider === 'mock') {
      if (isProduction()) throw new Error('no transcription provider is configured');
      return { text: `${SAMPLE_LABEL} ${SAMPLE_TRANSCRIPTS[opts.language || 'en']}`, provider: 'mock' };
    }
    if (!['groq', 'openai'].includes(provider)) throw new Error(`unknown TRANSCRIBE_PROVIDER "${provider}"`);
    if (!recordingUrl) throw new Error('the call has no recording URL');
    const url = checkRecordingUrl(recordingUrl);
    if (!aiBudget.take('ai')) throw new Error('AI_MAX_CALLS_PER_MINUTE reached');
    const text = await this.whisper(url, provider, opts.language);
    if (!text) throw new Error('the recording contained no recognisable speech');
    return { text, provider: `${provider}-whisper` };
  }

  private async whisper(recordingUrl: URL, provider: string, language?: Lang): Promise<string> {
    const groq = provider === 'groq';
    const key = groq ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;
    if (!key) throw new Error(`${groq ? 'GROQ_API_KEY' : 'OPENAI_API_KEY'} is not set`);
    const timeoutMs = Number(process.env.TRANSCRIBE_TIMEOUT_MS || 60000);
    const audio = await fetch(recordingUrl, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    if (!audio.ok) throw new Error(`could not download the recording (HTTP ${audio.status})`);
    const form = new FormData();
    form.append('file', await readCapped(audio, MAX_RECORDING_BYTES), 'recording.mp3');
    form.append('model', this.model);
    form.append('prompt', WHISPER_PROMPT);
    form.append('response_format', 'json');
    if (language) form.append('language', language);
    const endpoint = groq ? 'https://api.groq.com/openai/v1/audio/transcriptions' : 'https://api.openai.com/v1/audio/transcriptions';
    const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`${groq ? 'Groq' : 'OpenAI'} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data: any = await res.json();
    return String(data.text || '').trim();
  }
}

/** Reads a download into memory, refusing anything over `max` bytes whether or not the server declared its size. */
async function readCapped(res: Response, max: number): Promise<Blob> {
  if (Number(res.headers.get('content-length') || 0) > max) throw new Error('the recording is too large to transcribe');
  if (!res.body) return new Blob([await res.arrayBuffer()]);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error('the recording is too large to transcribe');
    }
    chunks.push(value);
  }
  return new Blob(chunks as BlobPart[]);
}
