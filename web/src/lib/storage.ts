/**
 * Local persistence of the pairing.
 *
 * This is the whole "account system": once a couple is paired, the ids live in
 * localStorage and Anivi reconnects to the same room on every launch. Leaving
 * the space is the only way to clear it.
 */

const KEY = 'anivi.pairing.v1';

export interface Pairing {
  roomId: string;
  loveCode: string;
  userId: string;
  paired: boolean;
}

export function loadPairing(): Pairing | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Pairing>;
    if (!parsed.roomId || !parsed.userId) return null;
    return {
      roomId: parsed.roomId,
      loveCode: parsed.loveCode ?? '',
      userId: parsed.userId,
      paired: Boolean(parsed.paired),
    };
  } catch {
    // A corrupt entry should not brick the app; treat it as unpaired.
    return null;
  }
}

export function savePairing(pairing: Pairing): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pairing));
  } catch {
    // Private mode with no quota: the session still works, it just won't survive a reload.
  }
}

export function clearPairing(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
