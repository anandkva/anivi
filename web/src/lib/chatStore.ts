import type { ChatMessage } from './protocol';
import { loadSettings } from './settingsStore';

export interface ChatThreadState {
  messages: ChatMessage[];
  typing: boolean;
  typingTimeout: number | null;
  lastReadAt: number;
  peerOnline: boolean;
  peerLastSeen: number | null;
}

// Local cache key
const CHAT_CACHE_KEY_PREFIX = 'anivi_chat_cache_';

export function loadCachedMessages(roomId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_CACHE_KEY_PREFIX + roomId);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveCachedMessages(roomId: string, messages: ChatMessage[]): void {
  try {
    // Keep last 300 messages per room in local cache
    const recent = messages.slice(-300);
    localStorage.setItem(CHAT_CACHE_KEY_PREFIX + roomId, JSON.stringify(recent));
  } catch {
    // ignore
  }
}

/**
 * Web Audio API synthesizer for WhatsApp-style subtle message sounds.
 */
class SoundEffects {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public playSend(): void {
    const settings = loadSettings();
    if (!settings.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08); // E6

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      // ignore
    }
  }

  public playReceive(): void {
    const settings = loadSettings();
    if (!settings.soundEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc2.frequency.setValueAtTime(880, now + 0.06); // A5

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.06);
      osc2.start(now + 0.06);
      osc2.stop(now + 0.18);
    } catch {
      // ignore
    }
  }
}

export const soundEffects = new SoundEffects();
