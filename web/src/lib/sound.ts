/**
 * A short two-note chime for the Miss You event, synthesized rather than
 * shipped as an asset so the PWA stays tiny and works offline.
 */

let ctx: AudioContext | null = null;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

function audioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/**
 * Browsers only allow audio after a user gesture. Call this from the first tap
 * so the chime can play later when a heart arrives.
 */
export function unlockSound(): void {
  const ac = audioContext();
  if (ac && ac.state === 'suspended') void ac.resume();
}

export function playHeartChime(): void {
  const ac = audioContext();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume();

  const now = ac.currentTime;
  const notes = [
    { freq: 880, at: 0, dur: 0.18 }, // A5
    { freq: 1174.66, at: 0.12, dur: 0.32 }, // D6
  ];

  for (const note of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = note.freq;

    const start = now + note.at;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);

    osc.connect(gain).connect(ac.destination);
    osc.start(start);
    osc.stop(start + note.dur + 0.05);
  }
}

/**
 * The sender's counterpart to the chime: one short, softer note.
 *
 * Pressing Miss You should feel like something left your hands — but it must
 * not sound like a heart arriving, or you can't tell the two apart when you
 * are both tapping at once.
 */
export function playSentBlip(): void {
  const ac = audioContext();
  if (!ac) return;
  if (ac.state === 'suspended') void ac.resume();

  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  // A small upward glide: the sound of something being sent away.
  osc.frequency.setValueAtTime(660, now);
  osc.frequency.exponentialRampToValueAtTime(990, now + 0.14);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}

/** A soft haptic where the platform supports it. */
export function buzz(pattern: number | number[] = [12, 40, 18]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}
