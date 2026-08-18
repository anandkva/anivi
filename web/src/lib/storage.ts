import type { Account } from './account';

/**
 * Local persistence.
 *
 * Only the account is stored: the connections list is authoritative on the
 * server and fetched on launch, so a phone that connected to someone new sees
 * them everywhere. Signing out is the only way to clear this.
 */

const KEY = 'anivi.account.v2';
const LEGACY_PAIRING_KEY = 'anivi.pairing.v1';

export function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Account>;
    if (!parsed.userId || !parsed.aniviCode) return null;
    return {
      userId: parsed.userId,
      aniviCode: parsed.aniviCode,
      name: parsed.name ?? '',
      createdAt: parsed.createdAt ?? 0,
    };
  } catch {
    // A corrupt entry should not brick the app; treat it as signed out.
    return null;
  }
}

export function saveAccount(account: Account): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(account));
  } catch {
    // Private mode with no quota: the session works, it just won't survive a reload.
  }
}

export function clearAccount(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_PAIRING_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * Removes the old Love-Code pairing left by earlier versions.
 *
 * There is nothing to migrate — a pairing was a room without an account behind
 * it, and the server no longer opens rooms that way — so the honest move is to
 * clear it and let the person create an account.
 */
export function dropLegacyPairing(): boolean {
  try {
    if (!localStorage.getItem(LEGACY_PAIRING_KEY)) return false;
    localStorage.removeItem(LEGACY_PAIRING_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Remembers which connection was open, so relaunching lands back in it. */
const LAST_CONNECTION_KEY = 'anivi.lastConnection.v1';

export function loadLastConnectionId(): string {
  try {
    return localStorage.getItem(LAST_CONNECTION_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastConnectionId(connectionId: string): void {
  try {
    if (connectionId) localStorage.setItem(LAST_CONNECTION_KEY, connectionId);
    else localStorage.removeItem(LAST_CONNECTION_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * When this device last looked at each room.
 *
 * Kept locally rather than on the server: "seen" is a property of the device
 * in your hand, and a read receipt is a feature Anivi has not chosen to have.
 */
const SEEN_KEY = 'anivi.seen.v1';

type SeenMap = Record<string, number>;

function readSeen(): SeenMap {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as SeenMap;
  } catch {
    return {};
  }
}

export function lastSeenAt(roomId: string): number {
  return readSeen()[roomId] ?? 0;
}

export function markSeen(roomId: string, at: number = Date.now()): void {
  try {
    const seen = readSeen();
    // Never move the mark backwards: an old tab shouldn't un-read a room.
    if ((seen[roomId] ?? 0) >= at) return;
    seen[roomId] = at;
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* private mode: badges just won't persist */
  }
}

/**
 * When this device last looked at the Emotions tab of a room.
 *
 * Tracked separately from the conversation: opening the chat says nothing
 * about whether you saw the hug someone sent.
 */
const EMOTIONS_SEEN_KEY = 'anivi.emotionsSeen.v1';

function readEmotionsSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(EMOTIONS_SEEN_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function lastEmotionsSeenAt(roomId: string): number {
  return readEmotionsSeen()[roomId] ?? 0;
}

export function markEmotionsSeen(roomId: string, at: number = Date.now()): void {
  try {
    const seen = readEmotionsSeen();
    if ((seen[roomId] ?? 0) >= at) return;
    seen[roomId] = at;
    localStorage.setItem(EMOTIONS_SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* private mode */
  }
}
