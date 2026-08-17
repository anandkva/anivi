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
}

export const STICKERS: Sticker[] = [
  { id: 'miss_you', art: '❤️', label: 'Miss you', hint: 'miss you da' },
  { id: 'hug', art: '🤗', label: 'Hug you', hint: 'kattikko' },
  { id: 'kiss', art: '😘', label: 'Kiss', hint: 'umma' },
  { id: 'love', art: '💖', label: 'Love you', hint: 'love you da' },
  { id: 'good_morning', art: '🌞', label: 'Good morning' },
  { id: 'good_night', art: '🌙', label: 'Good night' },
  { id: 'sorry', art: '🥺', label: 'Sorry' },
  { id: 'thanks', art: '🙏', label: 'Thank you' },
  { id: 'proud', art: '🎉', label: 'Proud of you' },
  { id: 'coffee', art: '☕', label: 'Coffee?' },
  { id: 'food', art: '🍜', label: 'Sapten?' },
  { id: 'sleepy', art: '😴', label: 'Sleepy' },
  { id: 'call_me', art: '📞', label: 'Call me' },
  { id: 'waiting', art: '⏳', label: 'Waiting' },
];

const BY_ID = new Map(STICKERS.map((s) => [s.id, s]));

/** Falls back to a heart, so an unknown sticker still reads as affection. */
export function stickerFor(id: string | undefined): Sticker {
  return (id && BY_ID.get(id)) || { id: id ?? 'love', art: '❤️', label: 'Love' };
}
