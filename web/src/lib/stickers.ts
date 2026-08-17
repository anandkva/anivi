/**
 * Anivi's clipart.
 *
 * Only the sticker's name travels over the wire and into the database — the
 * art is drawn by the client. That keeps messages tiny, lets the set be
 * restyled later without touching stored history, and means an unknown name
 * from a newer client degrades to a heart instead of breaking the chat.
 */

export interface Sticker {
  /** Stable id. Never rename one: it is what history stores. */
  id: string;
  art: string;
  label: string;
  /** Tamil-English label, the way the couple would actually say it. */
  hint?: string;
  /** CSS class to animate the sticker continuously */
  animation?: string;
}

export const STICKERS: Sticker[] = [
  { id: 'miss_you', art: '❤️', label: 'Miss You Paapu', animation: 'anim-heartbeat' },
  { id: 'miss_you_pappa', art: '💕', label: 'Miss you Pappa', animation: 'anim-heartbeat' },
  { id: 'love', art: '💖', label: 'Love you', animation: 'anim-pulse' },
  { id: 'hug', art: '🤗', label: 'Hug You', animation: 'anim-wiggle' },
  { id: 'kiss', art: '😘', label: 'Muththa', animation: 'anim-float' },
  { id: 'good_morning', art: '🌞', label: 'Gummaning', animation: 'anim-spin-slow' },
];

const BY_ID = new Map(STICKERS.map((s) => [s.id, s]));

/** Falls back to a heart, so an unknown sticker still reads as affection. */
export function stickerFor(id: string | undefined): Sticker {
  return (id && BY_ID.get(id)) || { id: id ?? 'love', art: '❤️', label: 'Love' };
}
